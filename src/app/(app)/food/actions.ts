"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString, num, reqNum, slot, timeString } from "@/lib/validation";
import { saveRecipe, deleteRecipe, recipeInput, checkRecipeAgainstPantry } from "@/lib/food/recipes";
import { addMeal, setServing, deleteMeal, updateMeal, copyWeek } from "@/lib/food/mealplan";
import { syncMealPlanGroceries, addGroceryItem, completeShopping, estimatePrice } from "@/lib/food/grocery";
import { setPantryQuantity, wastePantryItem, applyInventoryChanges } from "@/lib/food/pantry";
import { createFoodFromReference, linkReference, addAlias } from "@/lib/food/catalog";
import { searchReference } from "@/lib/food/reference";
import { logPlannedMeal, logFood, deleteLogItem } from "@/lib/food/foodlog";
import { proposeAction } from "@/lib/ai/actions";
import { proposeMealPlan, parsePlanRequest } from "@/lib/food/planner";
import { importFromUrl, importFromText, reextractImport } from "@/lib/food/importer";
import { parseMoneyToCents } from "@/lib/money";
import { parseIngredientLine } from "@/lib/food/parse";
import { round } from "@/lib/utils";
import { audit } from "@/lib/audit";

// ── Recipes ──
export async function saveRecipeAction(json: string, id?: string, importId?: string): Promise<ActionResult<{ id: string }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const r = await saveRecipe(recipeInput.parse(JSON.parse(json)), viewer, id);
    if (importId) await prisma.recipeImport.update({ where: { id: importId }, data: { status: "SAVED", recipeId: r.id } });
    return { id: r.id };
  }, "Recipe saved");
}
export async function deleteRecipeAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => deleteRecipe(String(fd.get("id")), viewer));
  redirect("/food/recipes");
}
export async function toggleFavouriteAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => {
    const r = await prisma.recipe.findUniqueOrThrow({ where: { id: String(fd.get("id")) } });
    await prisma.recipe.update({ where: { id: r.id }, data: { favourite: !r.favourite } });
  });
}
export async function discardImportAction(fd: FormData) {
  await requireViewer();
  await prisma.recipeImport.update({ where: { id: String(fd.get("id")) }, data: { status: "DISCARDED" } });
  redirect("/food/import");
}

// ── Food catalogue / reference ──
export async function searchFoodsAction(q: string) {
  await requireViewer();
  const query = q.trim();
  if (query.length < 2) return { catalogue: [], reference: [] };
  const catalogue = await prisma.foodItem.findMany({ where: { name: { contains: query } }, take: 10, orderBy: { name: "asc" } });
  return {
    catalogue: catalogue.map((f) => ({ id: f.id, name: f.name, defaultUnit: f.defaultUnit, kcal: f.kcalPer100g, source: f.nutritionSource })),
    reference: searchReference(query, 12).map((r) => ({ ndb: r.ndb, name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, portions: r.portions })),
  };
}
export async function linkReferenceAction(foodItemId: string, ndb: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const f = await linkReference(foodItemId, ndb);
    await audit({ profileId: viewer.profileId, action: "food.link", entityType: "foodItem", entityId: foodItemId, summary: `${f.name} → USDA ${ndb}` });
  }, "Linked to USDA reference data");
}
export async function createFromReferenceAction(ndb: string, name: string): Promise<ActionResult<{ id: string }>> {
  await requireViewer();
  return run(async () => ({ id: (await createFoodFromReference(ndb, name)).id }), "Food added to catalogue");
}
const foodUpdate = z.object({
  id: z.string(), name: z.string().trim().min(1), category: z.string(), defaultUnit: z.string(),
  gramsPerMl: num, gramsPerEach: num, kcal: num, protein: num, carbs: num, fat: num, fibre: num,
  labelGrams: num, barcode: z.string().optional(), alias: z.string().optional(), source: z.enum(["KEEP", "LABEL", "USER_ESTIMATE"]).default("KEEP"),
});
export async function updateFoodItemAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const f = foodUpdate.parse(Object.fromEntries(fd));
    // Label values may be per serving: normalise to per 100 g.
    const factor = f.labelGrams && f.labelGrams > 0 ? 100 / f.labelGrams : 1;
    const per = (v: number | undefined) => (v === undefined ? undefined : round(v * factor, 3));
    const nutrition = f.source === "KEEP" ? {} : { kcalPer100g: per(f.kcal) ?? null, proteinPer100g: per(f.protein) ?? null, carbsPer100g: per(f.carbs) ?? null, fatPer100g: per(f.fat) ?? null, fibrePer100g: per(f.fibre) ?? null, nutritionSource: f.source, nutritionVerified: f.source === "LABEL", usdaNdb: null };
    await prisma.foodItem.update({ where: { id: f.id }, data: { name: f.name, category: f.category, defaultUnit: f.defaultUnit, gramsPerMl: f.gramsPerMl ?? null, gramsPerEach: f.gramsPerEach ?? null, barcode: f.barcode?.trim() || null, ...nutrition } });
    if (f.alias?.trim()) for (const a of f.alias.split(",")) await addAlias(f.id, a);
    await audit({ profileId: viewer.profileId, action: "food.update", entityType: "foodItem", entityId: f.id, summary: f.name });
  }, "Food updated");
}
export async function findByBarcodeAction(code: string) {
  await requireViewer();
  const f = await prisma.foodItem.findUnique({ where: { barcode: code.trim() } });
  return f ? { id: f.id, name: f.name, defaultUnit: f.defaultUnit } : null;
}

// ── Meal plan ──
export async function addMealAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const profiles = await prisma.householdProfile.findMany({ where: { householdId: viewer.householdId } });
    const servings: Record<string, number> = {};
    for (const p of profiles) {
      const v = fd.get(`serv_${p.id}`);
      if (v !== null && v !== "") servings[p.id] = Number(v);
    }
    await addMeal({
      date: dateString.parse(fd.get("date")), slot: slot.parse(fd.get("slot")), recipeId: String(fd.get("recipeId") || "") || null, title: String(fd.get("title") ?? ""),
      notes: String(fd.get("notes") ?? ""), cookTime: timeString.parse(fd.get("cookTime")), prepNote: String(fd.get("prepNote") ?? ""),
      servings: Object.keys(servings).length ? servings : undefined, leftoverServings: num.parse(fd.get("leftovers")) ?? 0,
    }, viewer);
    await syncMealPlanGroceries();
  }, "Meal added — shopping list updated");
}
export async function setServingAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => {
    await setServing(String(fd.get("mealId")), String(fd.get("profileId")), Math.max(0, reqNum.parse(fd.get("servings"))));
    await syncMealPlanGroceries();
  });
}
export async function deleteMealAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => { await deleteMeal(String(fd.get("id")), viewer); await syncMealPlanGroceries(); });
}
export async function setMealStatusAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => { await updateMeal(String(fd.get("id")), { status: String(fd.get("status")) }); await syncMealPlanGroceries(); });
}
export async function moveMealAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => { await updateMeal(String(fd.get("id")), { date: dateString.parse(fd.get("date")), slot: slot.parse(fd.get("slot")) }); await syncMealPlanGroceries(); });
}
export async function substituteMealAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => { await updateMeal(String(fd.get("id")), { recipeId: String(fd.get("recipeId")) }); await syncMealPlanGroceries(); });
}
export async function copyWeekAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => { await copyWeek(String(fd.get("from")), String(fd.get("to")), viewer); await syncMealPlanGroceries(); });
}
/** Cooking a meal proposes pantry deductions (preview → approve). */
export async function proposeCookedAction(mealId: string): Promise<ActionResult<{ actionId: string; preview: unknown }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const meal = await prisma.mealPlanItem.findUniqueOrThrow({ where: { id: mealId }, include: { servings: true, recipe: true } });
    if (!meal.recipeId || !meal.recipe) {
      await updateMeal(mealId, { status: "COOKED" });
      return { actionId: "", preview: null };
    }
    const total = meal.servings.reduce((a, s) => a + s.servings, 0) || meal.recipe.servings;
    const leftovers = await prisma.mealPlanItem.findMany({ where: { leftoverFromId: mealId }, include: { servings: true } });
    const servings = total + leftovers.reduce((a, l) => a + l.servings.reduce((b, s) => b + s.servings, 0), 0);
    const check = await checkRecipeAgainstPantry(meal.recipeId, servings);
    const deductions = check.checks.filter((c) => c.foodItemId && c.required !== null && c.available > 0).map((c) => ({ foodItemId: c.foodItemId!, name: c.name, quantity: round(Math.min(c.required!, c.available), 3), unit: c.unit }));
    const action = await proposeAction(viewer, "MEAL_COOKED", `Cooked ${meal.title}: deduct ${deductions.length} ingredient(s) from the pantry`, { mealPlanItemId: mealId, deductions });
    return { actionId: action.id, preview: { deductions, notInPantry: check.checks.filter((c) => c.status === "missing").map((c) => c.name) } };
  });
}
export async function planWithAssistantAction(text: string): Promise<ActionResult<{ actionId: string; proposal: Awaited<ReturnType<typeof proposeMealPlan>> }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const proposal = await proposeMealPlan(parsePlanRequest(text));
    if (!proposal.meals.length) throw new Error(proposal.warnings.join(" ") || "No meals could be proposed");
    const action = await proposeAction(viewer, "MEAL_PLAN", `Plan ${proposal.meals.length} meals`, { meals: proposal.meals.map((m) => ({ date: m.date, slot: m.slot, recipeId: m.recipeId })) });
    return { actionId: action.id, proposal };
  });
}

// ── Pantry ──
export async function setPantryQtyAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => { await setPantryQuantity(String(fd.get("id")), Math.max(0, reqNum.parse(fd.get("quantity"))), viewer.profileId); await syncMealPlanGroceries(); });
}
export async function wastePantryAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => { await wastePantryItem(String(fd.get("id")), viewer.profileId); await syncMealPlanGroceries(); });
}
export async function updatePantryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => {
    await prisma.pantryItem.update({ where: { id: String(fd.get("id")) }, data: { location: String(fd.get("location")), expiryDate: String(fd.get("expiryDate") || "") || null, lowStockThreshold: num.parse(fd.get("lowStock")) ?? null, confidence: String(fd.get("confidence") || "CONFIRMED") } });
  }, "Updated");
}

// ── Grocery ──
export async function syncGroceryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => syncMealPlanGroceries({ from: dateString.parse(fd.get("from")), to: dateString.parse(fd.get("to")) }), (r) => `List recalculated from ${r.count} planned ingredient(s)`);
}
export async function toggleGroceryAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => {
    const it = await prisma.groceryItem.findUniqueOrThrow({ where: { id: String(fd.get("id")) } });
    await prisma.groceryItem.update({ where: { id: it.id }, data: { checked: !it.checked } });
  });
}
export async function setGroceryPriceAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => {
    const raw = String(fd.get("price") ?? "");
    const qty = num.parse(fd.get("quantity"));
    const it = await prisma.groceryItem.findUniqueOrThrow({ where: { id: String(fd.get("id")) }, include: { foodItem: true } });
    const quantity = qty && qty > 0 ? qty : it.quantity;
    const est = qty && qty !== it.quantity ? await estimatePrice(it.foodItem, quantity, it.unit) : null;
    await prisma.groceryItem.update({ where: { id: it.id }, data: { actualPriceCents: raw ? parseMoneyToCents(raw) : null, quantity, ...(est ? { estimatedPriceCents: est.cents } : {}) } });
  });
}
export async function deleteGroceryAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.groceryItem.delete({ where: { id: String(fd.get("id")) } }));
}
export async function addGroceryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => (await addGroceryItem({ name: z.string().trim().min(1, "Name required").parse(fd.get("name")), quantity: num.parse(fd.get("quantity")) ?? 1, unit: String(fd.get("unit") || "each") })).merged, (m) => (m ? "Merged with existing item" : "Added"));
}
export async function completeShoppingAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => completeShopping({
    listId: String(fd.get("listId")), storeName: String(fd.get("store") ?? ""), totalCents: parseMoneyToCents(String(fd.get("total") ?? "")),
    createExpense: fd.get("createExpense") === "on", addToPantry: fd.get("addToPantry") === "on", recordPrices: fd.get("recordPrices") === "on", paidByProfileId: String(fd.get("paidBy") || viewer.profileId),
  }, viewer.profileId), (r) => `Shopping recorded${r.expenseId ? ", expense added" : ""}${r.carriedOver ? `, ${r.carriedOver} item(s) carried to a new list` : ""}`);
}

// ── Nutrition log ──
export async function logPlannedAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => logPlannedMeal(viewer, String(fd.get("mealId"))));
}
export async function logFoodAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => { await logFood(viewer, { date: dateString.parse(fd.get("date")), slot: slot.parse(fd.get("slot")), foodItemId: z.string().min(1, "Choose a food").parse(fd.get("foodItemId")), quantity: reqNum.parse(fd.get("quantity")), unit: String(fd.get("unit") || "g") }); }, "Logged");
}
export async function deleteLogItemAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => deleteLogItem(viewer, String(fd.get("id"))));
}

// ── Import ──
export async function importUrlAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const url = String(fd.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Enter a full link starting with http(s)://" };
  const r = await importFromUrl(url, viewer);
  redirect(`/food/import/${r.importId}`);
}
export async function importTextAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const text = String(fd.get("text") ?? "");
  if (text.trim().length < 20) return { ok: false, error: "Paste the recipe text, caption or transcript" };
  const r = await importFromText(text, fd.get("method") === "TRANSCRIPT" ? "TRANSCRIPT" : "TEXT", viewer, String(fd.get("sourceUrl") || "") || null);
  redirect(`/food/import/${r.importId}`);
}

export async function addMissingToListAction(fd: FormData) {
  await requireViewer();
  await runVoid(async () => {
    const servings = num.parse(fd.get("servings"));
    const check = await checkRecipeAgainstPantry(String(fd.get("recipeId")), servings);
    for (const c of check.checks.filter((c) => !c.optional && c.status !== "have" && c.required !== null)) {
      await addGroceryItem({ name: c.name, quantity: round(c.missing, 2), unit: c.unit, note: `for ${check.recipe.name}` });
    }
  });
}

export async function substitutesAction(mealId: string) {
  await requireViewer();
  const { suggestSubstitutes } = await import("@/lib/food/mealplan");
  return (await suggestSubstitutes(mealId)).map((s) => ({ id: s.recipe.id, name: s.recipe.name, shared: s.shared }));
}

export async function reextractImportAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => reextractImport(String(fd.get("id"))));
}

// ── Recipe variants (adapt) ──
export async function adaptRecipeAction(recipeId: string, instruction: string) {
  await requireViewer();
  const { adaptRecipe } = await import("@/lib/food/variants");
  const { getLocalModel, extractJson } = await import("@/lib/ai/provider");
  return run(async () => {
    if (!instruction.trim()) throw new Error("Say how to adapt it, e.g. “make it dairy-free” or “swap butter for olive oil”.");
    const r = await prisma.recipe.findUniqueOrThrow({ where: { id: recipeId }, include: { ingredients: { orderBy: { sortOrder: "asc" } } } });
    const base = { name: r.name, instructions: r.instructions, notes: r.notes, tags: r.tags.split(",").filter(Boolean).join(", "), ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional })) };
    const result = adaptRecipe(base, instruction);
    let engine = "rules";
    if (result.unresolved.length) {
      const model = await getLocalModel();
      if (model) {
        try {
          const out = await model.complete({
            system: "You adapt recipes. Apply the instruction to the recipe JSON and return the COMPLETE updated JSON with the same keys: {name, instructions (string, one step per line), notes, tags, ingredients:[{name, quantity (number|null), unit, note, optional}]}. Keep everything else unchanged. Do not add nutrition.",
            prompt: `Recipe: ${JSON.stringify(result.draft)}\nInstruction: ${result.unresolved.join("; ")}`, json: true, maxTokens: 1500, timeoutMs: 60_000,
          });
          const j = extractJson(out) as typeof result.draft;
          if (Array.isArray(j.ingredients) && j.ingredients.length) {
            result.draft = { ...result.draft, ...j, ingredients: j.ingredients.map((i) => ({ name: String(i.name ?? "").slice(0, 160), quantity: Number(i.quantity) > 0 ? Number(i.quantity) : null, unit: String(i.unit ?? ""), note: String(i.note ?? ""), optional: Boolean(i.optional) })).filter((i) => i.name) };
            result.changes.push(`Local AI: ${result.unresolved.join("; ")}`);
            result.unresolved = [];
            engine = model.label;
          }
        } catch { /* keep rule-based result */ }
      }
    }
    const draft = {
      name: result.draft.name, cuisine: r.cuisine, category: r.category, servings: r.servings, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes, temperature: r.temperature,
      instructions: result.draft.instructions, sourceType: "VARIANT", sourceUrl: r.sourceUrl, notes: result.draft.notes, tags: result.draft.tags, favourite: false, variantOfId: r.id,
      ingredients: result.draft.ingredients,
    };
    return { draft, changes: result.changes, unresolved: result.unresolved, tips: result.tips, engine };
  });
}

// ── Collections ──
export async function createCollectionAction(name: string, recipeId?: string): Promise<ActionResult<{ id: string }>> {
  await requireViewer();
  return run(async () => {
    const n = z.string().trim().min(1, "Name the collection").max(60).parse(name);
    const c = await prisma.recipeCollection.upsert({ where: { name: n }, create: { name: n }, update: {} });
    if (recipeId) await prisma.recipeCollectionItem.upsert({ where: { collectionId_recipeId: { collectionId: c.id, recipeId } }, create: { collectionId: c.id, recipeId }, update: {} });
    return { id: c.id };
  });
}
export async function toggleCollectionAction(collectionId: string, recipeId: string): Promise<ActionResult> {
  await requireViewer();
  return run(async () => {
    const key = { collectionId_recipeId: { collectionId, recipeId } };
    if (await prisma.recipeCollectionItem.findUnique({ where: key })) await prisma.recipeCollectionItem.delete({ where: key });
    else await prisma.recipeCollectionItem.create({ data: { collectionId, recipeId } });
  });
}
export async function deleteCollectionAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.recipeCollection.delete({ where: { id: String(fd.get("id")) } }));
  redirect("/food/recipes");
}
export async function renameCollectionAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.recipeCollection.update({ where: { id: String(fd.get("id")) }, data: { name: z.string().trim().min(1).max(60).parse(fd.get("name")) } }));
}

// ── Store sections ──
export async function moveSectionAction(fd: FormData) {
  await requireViewer();
  const { orderedSections } = await import("@/lib/food/sections");
  const { getSetting, setSetting } = await import("@/lib/settings");
  await runVoid(async () => {
    const keys = orderedSections(await getSetting("grocery.sectionOrder", "[]")).map((s) => s.key as string);
    const i = keys.indexOf(String(fd.get("key")));
    const j = i + (fd.get("dir") === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    await setSetting("grocery.sectionOrder", JSON.stringify(keys));
  });
}
export async function setItemSectionAction(fd: FormData) {
  await requireViewer();
  const { categoryForSection } = await import("@/lib/food/sections");
  await runVoid(() => prisma.foodItem.update({ where: { id: String(fd.get("foodItemId")) }, data: { category: categoryForSection(String(fd.get("section"))) } }));
}

// ── Food photo → pantry / shopping list ──
const photoItems = z.object({
  photoId: z.string().uuid().nullable(),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().max(100000).nullable(),
    unit: z.string().max(20),
    location: z.enum(["FRIDGE", "FREEZER", "PANTRY", "OTHER"]),
    foodItemId: z.string().uuid().nullable(),
    destination: z.enum(["PANTRY", "LIST"]),
    checked: z.boolean(), // the person confirmed/edited the amount
  })).min(1, "Nothing selected").max(80),
});
export async function addPhotoItemsAction(json: string): Promise<ActionResult<{ pantry: number; list: number }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const { photoId, items } = photoItems.parse(JSON.parse(json));
    const toPantry = items.filter((i) => i.destination === "PANTRY");
    const toList = items.filter((i) => i.destination === "LIST");
    if (toPantry.length) {
      await applyInventoryChanges(toPantry.map((i) => ({
        action: "ADD" as const, name: i.name, foodItemId: i.foodItemId, quantity: i.quantity ?? 1, unit: i.quantity === null ? "each" : i.unit,
        location: i.location, confidence: i.checked && i.quantity !== null ? "CONFIRMED" as const : "ESTIMATED" as const,
      })), viewer.profileId, photoId ? { type: "photo", id: photoId } : undefined);
    }
    for (const i of toList) await addGroceryItem({ name: i.name, quantity: i.quantity ?? 1, unit: i.quantity === null ? "each" : i.unit, source: "PHOTO" });
    await syncMealPlanGroceries();
    await audit({ profileId: viewer.profileId, action: "food.photo", entityType: "file", entityId: photoId ?? undefined, summary: `Photo: ${toPantry.length} to pantry, ${toList.length} to shopping list` });
    return { pantry: toPantry.length, list: toList.length };
  }, (r) => [r.pantry ? `${r.pantry} added to the pantry` : "", r.list ? `${r.list} added to the shopping list` : ""].filter(Boolean).join(", "));
}

// ── Voice: "add milk and eggs to the shopping list" ──
export async function addSpokenShoppingAction(names: string[]): Promise<ActionResult<{ added: string[] }>> {
  const viewer = await requireViewer();
  return run(async () => {
    const list = z.array(z.string().trim().min(1).max(120)).min(1, "Nothing to add").max(30).parse(names);
    const added: string[] = [];
    for (const raw of list) {
      const p = parseIngredientLine(raw);
      const r = await addGroceryItem({ name: p.name || raw, quantity: p.quantity ?? 1, unit: p.quantity === null ? "each" : p.unit || "each", source: "VOICE" });
      added.push(r.item?.name ?? p.name ?? raw);
    }
    await audit({ profileId: viewer.profileId, action: "grocery.voice", entityType: "grocery", summary: `Voice: ${added.join(", ")}` });
    return { added };
  }, (r) => `Added to the shopping list: ${r.added.join(", ")}`);
}
