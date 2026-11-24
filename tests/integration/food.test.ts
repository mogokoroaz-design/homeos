import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { createFoodFromReference } from "@/lib/food/catalog";
import { saveRecipe, getRecipe, checkRecipeAgainstPantry } from "@/lib/food/recipes";
import { addMeal, setServing, getMealItems } from "@/lib/food/mealplan";
import { computeRequirements, syncMealPlanGroceries, addGroceryItem, getActiveList, completeShopping } from "@/lib/food/grocery";
import { addToPantry, applyInventoryChanges, expiringSoon } from "@/lib/food/pantry";
import { logPlannedMeal, dayLog } from "@/lib/food/foodlog";
import { handleMessage } from "@/lib/ai/assistant";
import { executeAction, rejectAction } from "@/lib/ai/actions";
import { proposeMealPlan, parsePlanRequest } from "@/lib/food/planner";
import { recordPrice } from "@/lib/finance/prices";
import { addDays, today } from "@/lib/dates";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer, sam: Viewer;
let chickenRecipeId: string;
const d = today();

beforeAll(async () => {
  ({ alex, sam } = await seedHousehold());
  // USDA SR28 reference foods (validated nutrition)
  await createFoodFromReference("05096", "Chicken thigh");
  await createFoodFromReference("11457", "Spinach");
  await createFoodFromReference("20044", "Rice");
  await createFoodFromReference("01123", "Egg");
  await createFoodFromReference("11260", "Mushroom");
  await prisma.nutritionTarget.create({ data: { profileId: alex.profileId, kcal: 2400, protein: 150, carbs: 270, fat: 80, fibre: 34, effectiveFrom: addDays(d, -30) } });
  await prisma.nutritionTarget.create({ data: { profileId: sam.profileId, kcal: 1600, protein: 100, carbs: 180, fat: 53, fibre: 22, effectiveFrom: addDays(d, -30) } });
});

describe("recipes & nutrition (acceptance 11, 12)", () => {
  it("saves a recipe, links ingredients and computes verified nutrition", async () => {
    const r = await saveRecipe({
      name: "Chicken, spinach & rice", cuisine: "Home", category: "main", servings: 4, prepMinutes: 10, cookMinutes: 30, temperature: "", instructions: "Cook rice\nSear chicken\nWilt spinach",
      sourceType: "MANUAL", sourceUrl: null, notes: "", tags: "Quick, Weeknight", favourite: false,
      ingredients: [
        { name: "chicken thighs", quantity: 800, unit: "g", note: "", optional: false },
        { name: "spinach", quantity: 200, unit: "g", note: "", optional: false },
        { name: "rice", quantity: 1.5, unit: "cup", note: "", optional: false },
        { name: "salt", quantity: null, unit: "", note: "to taste", optional: true },
      ],
    }, alex);
    chickenRecipeId = r.id;
    const full = (await getRecipe(r.id))!;
    expect(full.tags).toBe("quick,weeknight");
    expect(full.ingredients[0].foodItem?.name).toBe("Chicken thigh"); // alias matching "chicken thighs"
    // 800 g × 121 + 200 g × 23 + 1.5 cup rice (0.782 g/ml) × 365 kcal/100g
    const expected = 800 * 1.21 + 200 * 0.23 + 1.5 * 236.5882365 * 0.782 * 3.65;
    expect(full.nutrition.total.kcal).toBe(Math.round(expected));
    expect(full.nutrition.verified).toBe(true);
    expect(full.nutrition.perServing.kcal).toBe(Math.round(expected / 4));
  });

  it("edits a recipe", async () => {
    const r = (await getRecipe(chickenRecipeId))!;
    await saveRecipe({ ...r, prepMinutes: 15, cookMinutes: r.cookMinutes, sourceUrl: r.sourceUrl, category: "main" as const, ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional, foodItemId: i.foodItemId })) }, alex, r.id);
    expect((await getRecipe(r.id))!.prepMinutes).toBe(15);
  });
});

describe("meal plan → portions → groceries → pantry (acceptance 5–8)", () => {
  it("sizes each person's portion from their own target", async () => {
    await addMeal({ date: d, slot: "DINNER", recipeId: chickenRecipeId }, alex);
    const [meal] = await getMealItems(d, d);
    const perServing = meal.nutrition!.perServing.kcal;
    const a = meal.servings.find((s) => s.profileId === alex.profileId)!.servings;
    const s = meal.servings.find((x) => x.profileId === sam.profileId)!.servings;
    expect(a).toBe(Math.min(4, Math.max(0.5, Math.round(((2400 * 0.35) / perServing) * 4) / 4)));
    expect(s).toBe(Math.min(4, Math.max(0.5, Math.round(((1600 * 0.35) / perServing) * 4) / 4)));
    expect(a).toBeGreaterThan(s);
  });

  it("generates grocery requirements scaled to total servings", async () => {
    await prisma.mealServing.updateMany({ data: { servings: 2 } }); // 4 servings total = recipe size
    const reqs = await computeRequirements(d, d);
    expect(reqs.find((r) => r.name === "Chicken thigh")).toMatchObject({ required: 800, unit: "g", toBuy: 800 });
    const rice = reqs.find((r) => r.name === "Rice")!;
    expect(rice.unit).toBe("g");
    expect(rice.required).toBeCloseTo(1.5 * 236.5882365 * 0.782, 1);
    expect(reqs.find((r) => r.name.toLowerCase().includes("salt"))).toBeUndefined(); // optional, unquantified
  });

  it("deducts pantry stock from requirements, across units", async () => {
    await addToPantry({ name: "Chicken thigh", quantity: 0.5, unit: "kg", profileId: alex.profileId });
    await addToPantry({ name: "Spinach", quantity: 300, unit: "g", confidence: "ESTIMATED", expiryDate: addDays(d, 1) });
    const reqs = await computeRequirements(d, d);
    expect(reqs.find((r) => r.name === "Chicken thigh")).toMatchObject({ inPantry: 500, toBuy: 300 });
    expect(reqs.find((r) => r.name === "Spinach")).toMatchObject({ toBuy: 0, pantryConfidence: "ESTIMATED" });
  });

  it("syncs the shopping list and recalculates when servings change; prevents duplicates", async () => {
    await recordPrice({ productName: "Chicken thighs", brandName: "Farm Co", packageSize: 500, packageUnit: "g", storeName: "Fresh Market", date: d, priceCents: 649, source: "RECEIPT", foodItemId: (await prisma.foodItem.findUniqueOrThrow({ where: { name: "Chicken thigh" } })).id });
    await syncMealPlanGroceries({ from: d, to: d });
    const list = await getActiveList();
    let items = await prisma.groceryItem.findMany({ where: { listId: list.id } });
    const chicken = items.find((i) => i.name === "Chicken thigh")!;
    expect(chicken.quantity).toBe(300);
    expect(chicken.estimatedPriceCents).toBe(649); // one 500 g pack
    expect(items.find((i) => i.name === "Spinach")).toBeUndefined();

    const [meal] = await getMealItems(d, d);
    await setServing(meal.id, alex.profileId, 4); // 6 servings → 1200 g chicken
    await syncMealPlanGroceries();
    items = await prisma.groceryItem.findMany({ where: { listId: list.id } });
    expect(items.find((i) => i.name === "Chicken thigh")!.quantity).toBe(700);
    expect(items.find((i) => i.name === "Chicken thigh")!.estimatedPriceCents).toBe(1298); // two packs

    const first = await addGroceryItem({ name: "milk", quantity: 1, unit: "l" });
    const second = await addGroceryItem({ name: "Milk", quantity: 500, unit: "ml" });
    expect(second.merged).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.quantity).toBe(1.5);
  });

  it("completing shopping updates pantry, ledger and price history", async () => {
    const list = await getActiveList();
    const chicken = await prisma.groceryItem.findFirstOrThrow({ where: { listId: list.id, name: "Chicken thigh" } });
    await prisma.groceryItem.update({ where: { id: chicken.id }, data: { checked: true, actualPriceCents: 1250 } });
    const res = await completeShopping({ listId: list.id, storeName: "Fresh Market", totalCents: null, createExpense: true, addToPantry: true, recordPrices: true, paidByProfileId: sam.profileId }, sam.profileId);
    expect(res.bought).toBe(1);
    expect(res.carriedOver).toBeGreaterThan(0); // milk moves to a new list
    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: res.expenseId! }, include: { category: true } });
    expect(exp).toMatchObject({ amountCents: 1250, source: "SHOPPING", paidByProfileId: sam.profileId });
    expect(exp.category.key).toBe("groceries");
    const reqs = await computeRequirements(d, d);
    expect(reqs.find((r) => r.name === "Chicken thigh")!.toBuy).toBe(0);
    expect(await prisma.priceRecord.count()).toBe(2);
  });

  it("logs a planned portion into the person's food log", async () => {
    const [meal] = await getMealItems(d, d);
    await logPlannedMeal(sam, meal.id);
    const log = await dayLog(sam, sam.profileId, d);
    expect(log.items).toHaveLength(1);
    expect(log.totals.kcal).toBe(Math.round(meal.nutrition!.perServing.kcal * 2));
    expect(log.items[0].isEstimate).toBe(false);
  });
});

describe("kitchen assistant (acceptance 9) — rule-based, approval-gated", () => {
  it("enters ingredients conversationally only after approval", async () => {
    const r = await handleMessage(alex, { text: "We bought 2kg rice and 6 eggs", surface: "KITCHEN" });
    const card = r.message.cards.find((c) => c.type === "action")!;
    expect(card.type).toBe("action");
    const before = await prisma.pantryItem.count();
    expect(await prisma.pantryItem.count()).toBe(before); // nothing changed yet
    await executeAction(alex, (card as { actionId: string }).actionId);
    const rice = await prisma.pantryItem.findFirstOrThrow({ where: { name: "Rice" } });
    expect(rice).toMatchObject({ quantity: 2, unit: "kg" });
    const eggs = await prisma.pantryItem.findFirstOrThrow({ where: { name: "Egg" } });
    expect(eggs.quantity).toBe(6);
    await expect(executeAction(alex, (card as { actionId: string }).actionId)).rejects.toThrow(/already/);
  });

  it("another profile cannot approve your proposal", async () => {
    const r = await handleMessage(alex, { text: "used 100 g spinach", surface: "KITCHEN" });
    const id = (r.message.cards.find((c) => c.type === "action") as { actionId: string }).actionId;
    await expect(executeAction(sam, id)).rejects.toThrow(/not found/i);
    await rejectAction(alex, id);
  });

  it("answers pantry questions from real records and flags uncertainty", async () => {
    const r = await handleMessage(alex, { text: "What vegetables are left?", surface: "KITCHEN" });
    expect(r.message.content).toMatch(/estimated or unverified/);
    const list = r.message.cards[0] as { items: { label: string }[] };
    expect(list.items.map((i) => i.label)).toContain("Spinach");
    expect(list.items.map((i) => i.label)).not.toContain("Rice");
    const exp = await handleMessage(alex, { text: "What is expiring?", surface: "KITCHEN" });
    expect(JSON.stringify(exp.message.cards)).toContain("Spinach");
    expect((await expiringSoon(3)).map((p) => p.name)).toContain("Spinach");
  });

  it("finds recipes for given ingredients and what can be made without shopping", async () => {
    const r = await handleMessage(alex, { text: "What can I cook with 500g chicken thighs, spinach and mushrooms?", surface: "KITCHEN" });
    expect(JSON.stringify(r.message.cards)).toContain("Chicken, spinach & rice");
    const w = await handleMessage(alex, { text: "What can I make without going grocery shopping?", surface: "KITCHEN" });
    const check = await checkRecipeAgainstPantry(chickenRecipeId);
    expect(w.message.content).toMatch(check.canCook ? /You can make 1/ : /none of your saved recipes/i);
  });

  it("plans meals with budget and repeat constraints, then applies on approval", async () => {
    for (const [name, ing] of [["Mushroom omelette", "eggs"], ["Egg fried rice", "eggs"], ["Chicken rice bowl", "chicken thighs"], ["Chicken soup", "chicken thighs"], ["Mushroom risotto", "rice"]] as const) {
      await saveRecipe({ name, cuisine: "", category: "main", servings: 2, prepMinutes: null, cookMinutes: null, temperature: "", instructions: "", sourceType: "MANUAL", sourceUrl: null, notes: "", tags: "", favourite: false, ingredients: [{ name: ing, quantity: 2, unit: ing === "eggs" ? "each" : "cup", note: "", optional: false }, { name: "mushroom", quantity: 100, unit: "g", note: "", optional: false }] }, alex);
    }
    const start = addDays(d, 1);
    const req = { ...parsePlanRequest("Plan seven days of dinners using our existing pantry inventory, keep grocery spending under $120 and avoid repeating chicken more than twice."), startDate: start };
    const proposal = await proposeMealPlan(req);
    expect(proposal.meals).toHaveLength(7);
    const chickenMeals = proposal.meals.filter((m) => /chicken/i.test(m.title));
    expect(chickenMeals.length).toBeLessThanOrEqual(2);
    expect(await prisma.mealPlanItem.count({ where: { date: { gte: start } } })).toBe(0); // proposal only

    const chat = await handleMessage(alex, { text: "Plan 3 dinners starting tomorrow with no chicken more than once", surface: "KITCHEN" });
    const card = chat.message.cards.find((c) => c.type === "action") as { actionId: string };
    await executeAction(alex, card.actionId);
    const planned = await prisma.mealPlanItem.findMany({ where: { date: { gte: start } }, include: { servings: true } });
    expect(planned).toHaveLength(3);
    expect(planned.filter((p) => /chicken/i.test(p.title)).length).toBeLessThanOrEqual(1);
    expect(planned.every((p) => p.servings.length === 2)).toBe(true);
    expect(await prisma.aIAction.findUniqueOrThrow({ where: { id: card.actionId } })).toMatchObject({ status: "EXECUTED" });
  });

  it("deducts ingredients when a meal is cooked (after approval)", async () => {
    const [meal] = await getMealItems(d, d);
    const check = await checkRecipeAgainstPantry(meal.recipeId!, 6);
    const { proposeAction } = await import("@/lib/ai/actions");
    const deductions = check.checks.filter((c) => c.foodItemId && c.required !== null && c.available > 0).map((c) => ({ foodItemId: c.foodItemId!, name: c.name, quantity: Math.min(c.required!, c.available), unit: c.unit }));
    const a = await proposeAction(alex, "MEAL_COOKED", "cooked", { mealPlanItemId: meal.id, deductions });
    const before = (await prisma.pantryItem.findMany({ where: { name: "Chicken thigh" } })).reduce((s, p) => s + p.quantity * (p.unit === "kg" ? 1000 : 1), 0);
    await executeAction(alex, a.id);
    const after = (await prisma.pantryItem.findMany({ where: { name: "Chicken thigh" } })).reduce((s, p) => s + p.quantity * (p.unit === "kg" ? 1000 : 1), 0);
    expect(before - after).toBeCloseTo(Math.min(1200, before), 3);
    expect((await prisma.mealPlanItem.findUniqueOrThrow({ where: { id: meal.id } })).status).toBe("COOKED");
    expect(await prisma.inventoryTransaction.count({ where: { reason: "MEAL" } })).toBeGreaterThan(0);
  });

  it("refuses unknown inventory quantities rather than guessing", async () => {
    const res = await applyInventoryChanges([{ action: "ADD", name: "Butter", quantity: null, unit: "" }], alex.profileId);
    expect(res[0]).toMatch(/no quantity/);
  });
});
