// HomeOS assistant. Deterministic intent handlers answer from real records; optional local
// AI (Ollama) handles open questions with a grounded context snapshot. Any change is only
// ever *proposed* as an AIAction that the user approves.
import { prisma } from "../db";
import type { Viewer } from "../auth/session";
import { parseInventoryText, parseIngredientLine } from "../food/parse";
import { listPantry, pantryByFood, expiringSoon, lowStock } from "../food/pantry";
import { checkRecipeAgainstPantry, describeCheck, recipeInput } from "../food/recipes";
import { proposeMealPlan, parsePlanRequest } from "../food/planner";
import { loadFoodIndex, matchFood } from "../food/catalog";
import { getActiveList } from "../food/grocery";
import { dayLog } from "../food/foodlog";
import { proposeAction } from "./actions";
import { parseMealRequest } from "../food/meal-request";
import { getLocalModel, extractJson } from "./provider";
import { formatQuantity } from "../units";
import { formatCents } from "../money";
import { addDays, today, formatDate, relativeDay, monthOf, addMonthsToMonth, weekday, weekdayName } from "../dates";
import { billOccurrences } from "../finance/bills";
import { monthSummary } from "../finance/ledger";
import { priceChanges, brandSwitchSavings, productComparison } from "../finance/prices";
import { calendarItems } from "../calendar";
import { buildProjectProposal } from "../projects/builder";
import { tokens, round } from "../utils";
import { unitPriceDisplay } from "../units";

export type Card =
  | { type: "list"; title: string; items: { label: string; detail?: string; badge?: string; tone?: "ok" | "warn" | "muted"; href?: string }[] }
  | { type: "action"; actionId: string; kind: string; summary: string; preview: unknown }
  | { type: "note"; text: string };

export interface Reply { text: string; cards: Card[]; provider: string }

const CONF_LABEL: Record<string, string> = { CONFIRMED: "confirmed", ESTIMATED: "estimated", UNVERIFIED: "unverified" };

const CATEGORY_WORDS: Record<string, string[]> = {
  vegetable: ["vegetable", "veg", "veggie", "greens"], fruit: ["fruit"], meat: ["meat", "protein"], seafood: ["fish", "seafood"],
  dairy: ["dairy", "egg", "cheese", "milk"], grain: ["grain", "carb", "rice", "pasta"], spice: ["spice", "herb"], legume: ["legume", "bean", "lentil"],
};

type Handler = { test: (t: string) => boolean; run: (ctx: Ctx) => Promise<Reply> };
interface Ctx { viewer: Viewer; text: string; lower: string; conversationId: string; surface: string }

const reply = (text: string, cards: Card[] = []): Reply => ({ text, cards, provider: "rules" });

async function pantryAnswer(ctx: Ctx): Promise<Reply> {
  const cat = Object.entries(CATEGORY_WORDS).find(([, words]) => words.some((w) => ctx.lower.includes(w)))?.[0];
  const items = await listPantry();
  const filtered = cat ? items.filter((i) => (i.foodItem?.category ?? "other") === cat || (cat === "meat" && ["meat", "seafood", "legume"].includes(i.foodItem?.category ?? ""))) : items;
  if (!filtered.length) return reply(cat ? `The pantry records show no ${cat === "vegetable" ? "vegetables" : cat} right now.` : "The pantry has no recorded items. Add stock on the Pantry page or tell me what you bought.");
  const unverified = filtered.filter((i) => i.confidence !== "CONFIRMED").length;
  return reply(
    `Here's what the pantry records show${cat ? ` (${cat})` : ""}: ${filtered.length} item${filtered.length > 1 ? "s" : ""}.${unverified ? ` ${unverified} quantit${unverified > 1 ? "ies are" : "y is"} estimated or unverified — worth a quick check.` : ""} I only know what has been recorded, not what's physically in the fridge.`,
    [{ type: "list", title: "Pantry", items: filtered.slice(0, 40).map((i) => ({ label: i.name, detail: `${formatQuantity(i.quantity, i.unit)} · ${i.location.toLowerCase()}${i.expiryDate ? ` · exp ${relativeDay(i.expiryDate)}` : ""}`, badge: CONF_LABEL[i.confidence], tone: i.confidence === "CONFIRMED" ? "ok" : "warn" })) }],
  );
}

async function expiringAnswer(): Promise<Reply> {
  const items = await expiringSoon(4);
  if (!items.length) return reply("Nothing in the pantry records expires in the next 4 days. (Items without an expiry date aren't tracked for this.)");
  const expired = items.filter((i) => i.expiryDate! < today());
  return reply(`${items.length} item(s) expire within 4 days${expired.length ? `, ${expired.length} already past their date` : ""}.`, [
    { type: "list", title: "Use soon", items: items.map((i) => ({ label: i.name, detail: `${formatQuantity(i.quantity, i.unit)} · ${relativeDay(i.expiryDate!)}`, tone: i.expiryDate! < today() ? "warn" : "muted", badge: CONF_LABEL[i.confidence] })) },
  ]);
}

async function rankRecipes(onlyComplete: boolean, focusFoodIds: string[] = []) {
  const recipes = await prisma.recipe.findMany({ select: { id: true } });
  const stock = await pantryByFood();
  const results = [];
  for (const r of recipes) {
    const check = await checkRecipeAgainstPantry(r.id, undefined, stock);
    const focus = focusFoodIds.length ? check.recipe.ingredients.filter((i) => i.foodItemId && focusFoodIds.includes(i.foodItemId)).length : 0;
    if (focusFoodIds.length && !focus) continue;
    if (onlyComplete && !check.canCook) continue;
    results.push({ ...check, focus });
  }
  return results.sort((a, b) => b.focus - a.focus || b.coverage - a.coverage);
}

function recipeItems(list: Awaited<ReturnType<typeof rankRecipes>>) {
  return list.slice(0, 8).map((c) => {
    const missing = c.checks.filter((x) => !x.optional && x.status !== "have");
    const unsure = c.checks.some((x) => x.status === "have" && x.confidence !== "CONFIRMED");
    return {
      label: c.recipe.name,
      detail: missing.length ? `Missing: ${missing.slice(0, 4).map(describeCheck).join(", ")}${missing.length > 4 ? "…" : ""}` : unsure ? "All ingredients recorded (some quantities unverified)" : "Everything is in the pantry",
      badge: `${Math.round(c.coverage * 100)}%`,
      tone: (missing.length ? "muted" : "ok") as "ok" | "muted",
      href: `/food/recipes/${c.recipe.id}`,
    };
  });
}

async function whatCanICook(ctx: Ctx, onlyComplete: boolean): Promise<Reply> {
  const count = await prisma.recipe.count();
  if (!count) return reply("Your recipe library is empty, so I can't match recipes to the pantry yet. Add or import a recipe first.");
  const ranked = await rankRecipes(onlyComplete);
  if (!ranked.length) {
    const partial = (await rankRecipes(false)).slice(0, 5);
    return reply("Based on the pantry records, none of your saved recipes can be made without shopping. These are the closest:", [{ type: "list", title: "Closest matches", items: recipeItems(partial) }]);
  }
  return reply(onlyComplete ? `You can make ${ranked.length} recipe(s) with what's recorded in the pantry:` : "Recipes ranked by how much of each is already in the pantry:", [{ type: "list", title: "Recipes", items: recipeItems(ranked) }]);
}

async function cookWith(ctx: Ctx, list: string): Promise<Reply> {
  const parts = list.split(/,|\band\b|\+|&/).map((p) => p.trim()).filter(Boolean);
  const index = await loadFoodIndex();
  const parsed = parts.map((p) => ({ p: parseIngredientLine(p), food: matchFood(index, parseIngredientLine(p).name) }));
  const ids = parsed.map((x) => x.food?.id).filter(Boolean) as string[];
  const ranked = ids.length ? await rankRecipes(false, ids) : [];
  if (ranked.length) {
    return reply(`Saved recipes that use ${parsed.map((x) => x.p.name).join(", ")}:`, [{ type: "list", title: "Matching recipes", items: recipeItems(ranked) }]);
  }
  const model = await getLocalModel();
  if (!model) return reply(`None of your saved recipes use ${parsed.map((x) => x.p.name).join(", ")}. Local AI is off, so I won't invent a recipe — you can enable Ollama in Settings, or add a recipe yourself.`);
  try {
    const raw = await model.complete({
      system: "You are a cooking assistant. Create ONE simple home recipe as JSON with keys: name, cuisine, servings (number), prepMinutes, cookMinutes, temperature (string), ingredients (array of {name, quantity (number or null), unit}), instructions (array of strings). Use only common pantry staples beyond the given ingredients. Do NOT include nutrition values.",
      prompt: `Ingredients available: ${parts.join(", ")}`,
      json: true,
      maxTokens: 800,
    });
    const j = extractJson(raw) as Record<string, unknown>;
    const draft = recipeInput.parse({
      name: String(j.name ?? "AI recipe").slice(0, 160), cuisine: String(j.cuisine ?? ""), servings: Number(j.servings) || 2,
      prepMinutes: Number.isFinite(Number(j.prepMinutes)) ? Math.round(Number(j.prepMinutes)) : null, cookMinutes: Number.isFinite(Number(j.cookMinutes)) ? Math.round(Number(j.cookMinutes)) : null,
      temperature: String(j.temperature ?? ""), instructions: Array.isArray(j.instructions) ? j.instructions.map(String).join("\n") : String(j.instructions ?? ""),
      sourceType: "AI", notes: "Generated by local AI — review before cooking. Nutrition is calculated from linked reference foods, not by the AI.", tags: "ai-generated",
      ingredients: (Array.isArray(j.ingredients) ? j.ingredients : []).slice(0, 40).map((i: Record<string, unknown>) => ({ name: String(i.name ?? "").slice(0, 160) || "ingredient", quantity: Number(i.quantity) > 0 ? Number(i.quantity) : null, unit: String(i.unit ?? ""), note: "", optional: false })),
    });
    const action = await proposeAction(ctx.viewer, "RECIPE_SAVE", `Save AI recipe "${draft.name}"`, { recipe: draft }, ctx.conversationId);
    return { text: `None of your saved recipes match, so the local model (${model.label}) drafted one. It's unverified — review it, and save it only if you like it.`, cards: [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: draft }], provider: model.id };
  } catch (e) {
    return reply(`None of your saved recipes match, and the local AI could not produce a valid recipe (${e instanceof Error ? e.message : "error"}).`);
  }
}

async function missingFor(ctx: Ctx, name: string): Promise<Reply> {
  const q = tokens(name);
  const recipes = await prisma.recipe.findMany({ select: { id: true, name: true } });
  const best = recipes.map((r) => ({ r, s: tokens(r.name).filter((t) => q.includes(t)).length })).sort((a, b) => b.s - a.s)[0];
  if (!best || best.s === 0) return reply(`I couldn't find a saved recipe matching "${name}".`);
  const check = await checkRecipeAgainstPantry(best.r.id);
  const missing = check.checks.filter((c) => !c.optional && c.status !== "have");
  if (!missing.length) return reply(`You have everything recorded for ${best.r.name}.${check.checks.some((c) => c.confidence !== "CONFIRMED" && c.status === "have") ? " Some quantities are estimates, so double-check." : ""}`);
  const action = await proposeAction(ctx.viewer, "GROCERY_ADD", `Add ${missing.length} missing item(s) for ${best.r.name} to the shopping list`, { items: missing.filter((m) => m.required !== null).map((m) => ({ name: m.name, quantity: round(m.missing, 2), unit: m.unit })) }, ctx.conversationId).catch(() => null);
  return reply(`For ${best.r.name} you're missing:`, [
    { type: "list", title: "Missing", items: missing.map((m) => ({ label: m.name, detail: m.required === null ? "as needed" : `need ${formatQuantity(m.required, m.unit)}, have ${formatQuantity(round(m.available, 2), m.unit)}`, tone: "warn" })) },
    ...(action ? [{ type: "action" as const, actionId: action.id, kind: action.kind, summary: action.summary, preview: JSON.parse(action.payload) }] : []),
  ]);
}

async function shoppingAnswer(): Promise<Reply> {
  const list = await getActiveList();
  const items = await prisma.groceryItem.findMany({ where: { listId: list.id, checked: false }, orderBy: { name: "asc" } });
  const low = await lowStock();
  const cards: Card[] = [];
  if (items.length) cards.push({ type: "list", title: "On the shopping list", items: items.map((i) => ({ label: i.name, detail: [i.quantity ? formatQuantity(i.quantity, i.unit) : "as needed", i.estimatedPriceCents ? `≈ ${formatCents(i.estimatedPriceCents)}` : null].filter(Boolean).join(" · "), href: "/food/grocery" })) });
  if (low.length) cards.push({ type: "list", title: "Low stock", items: low.map((l) => ({ label: l.name, detail: `${formatQuantity(l.quantity, l.unit)} left (threshold ${l.threshold})`, tone: "warn" })) });
  const est = items.reduce((a, i) => a + (i.estimatedPriceCents ?? 0), 0);
  if (!cards.length) return reply("The shopping list is empty and nothing is below its low-stock threshold. Generate a list from the meal plan on the Grocery page.");
  return reply(`${items.length} item(s) on the list${est ? `, about ${formatCents(est)} based on recorded prices` : ""}${low.length ? ` and ${low.length} low-stock item(s)` : ""}.`, cards);
}

async function mealAdd(ctx: Ctx): Promise<Reply> {
  const req = parseMealRequest(ctx.text, today());
  if (!req) return reply("Tell me the meal and when, e.g. “add 1 cup boiled rice to my lunch today” or “put lemon pasta on dinner tomorrow”.");
  const recipes = await prisma.recipe.findMany({ select: { id: true, name: true } });
  const key = (s: string) => tokens(s).join(" ");
  const recipe = recipes.find((r) => key(r.name) === key(req.name)) ?? recipes.find((r) => key(req.name).length > 3 && key(r.name).includes(key(req.name)));
  const pretty = req.name.charAt(0).toUpperCase() + req.name.slice(1);
  const title = recipe?.name ?? (req.quantity !== null ? `${pretty} (${formatQuantity(req.quantity, req.unit)})` : pretty);
  const payload = {
    date: req.date, slot: req.slot, title, recipeId: recipe?.id ?? null, who: req.who,
    servings: recipe ? null : 1,
    food: !recipe && req.quantity !== null ? { name: req.name, quantity: req.quantity, unit: req.unit || "each" } : null,
    addToPlan: req.addToPlan, logEaten: req.logEaten,
  };
  const when = `${req.slot.toLowerCase()} ${req.date === today() ? "today" : `on ${formatDate(req.date, { weekday: true })}`}`;
  const summary = [req.addToPlan ? `Add ${title} to ${req.who === "me" ? "your" : "the household's"} ${when}` : null, req.logEaten ? `${req.addToPlan ? "log" : "Log"} it as eaten` : null].filter(Boolean).join(" and ");
  const action = await proposeAction(ctx.viewer, "MEAL_ADD", summary, payload, ctx.conversationId);
  const notes = [
    !recipe && req.logEaten && req.quantity === null ? "Tell me an amount (e.g. “1 cup”) if you want the calories counted." : "",
    recipe ? `Matched your saved recipe “${recipe.name}”.` : "",
  ].filter(Boolean).join(" ");
  return reply(`Here's what I understood. Nothing changes until you approve.${notes ? ` ${notes}` : ""}`, [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: payload }]);
}

async function inventoryChange(ctx: Ctx): Promise<Reply> {
  const changes = parseInventoryText(ctx.text);
  if (!changes.length) return reply("I couldn't pick out any items. Try something like “we bought 2 kg rice and 6 eggs”.");
  const index = await loadFoodIndex();
  const preview = changes.map((c) => ({ action: c.action, name: matchFood(index, c.name)?.name ?? c.name, foodItemId: matchFood(index, c.name)?.id ?? null, quantity: c.quantity, unit: c.unit || "each", location: c.location, confidence: "CONFIRMED" as const }));
  const verb = { ADD: "Add", CONSUME: "Use", WASTE: "Discard", SET: "Set" } as const;
  const action = await proposeAction(ctx.viewer, "PANTRY_UPDATE", "Pantry: " + preview.map((p) => `${verb[p.action]} ${p.quantity === null ? "" : formatQuantity(p.quantity, p.unit) + " "}${p.name}`).join(", "), { changes: preview }, ctx.conversationId);
  const unknown = preview.filter((p) => !p.foodItemId).map((p) => p.name);
  return reply(`Here's what I understood. Nothing changes until you approve.${unknown.length ? ` New catalogue item(s) will be created for: ${unknown.join(", ")}.` : ""}`, [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: { changes: preview } }]);
}

async function mealPlanAnswer(ctx: Ctx): Promise<Reply> {
  const req = parsePlanRequest(ctx.text);
  const proposal = await proposeMealPlan(req);
  if (!proposal.meals.length) return reply(proposal.warnings.join(" ") || "I couldn't build a plan.");
  const action = await proposeAction(ctx.viewer, "MEAL_PLAN", `Plan ${proposal.meals.length} meal(s) from ${formatDate(req.startDate)}`, { meals: proposal.meals.map((m) => ({ date: m.date, slot: m.slot, recipeId: m.recipeId })) }, ctx.conversationId);
  const constraint = [req.budgetCents !== null ? `budget ${formatCents(req.budgetCents)}` : null, ...Object.entries(req.maxRepeats).map(([t, n]) => `${t} ≤ ${n}×`), req.preferPantry ? "pantry first" : null].filter(Boolean).join(", ");
  return reply(
    `Proposed ${proposal.meals.length} ${req.slots.map((s) => s.toLowerCase()).join("/")}(s)${constraint ? ` (${constraint})` : ""}. Estimated extra grocery cost: ${formatCents(proposal.totalKnownCostCents)}${proposal.unpriced.length ? " plus unpriced items" : ""}.${req.budgetCents !== null ? proposal.totalKnownCostCents <= req.budgetCents ? " Within budget." : " Over budget." : ""}`,
    [
      { type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: proposal },
      ...(proposal.warnings.length ? [{ type: "note" as const, text: proposal.warnings.join(" ") }] : []),
    ],
  );
}

async function caloriesAnswer(ctx: Ctx): Promise<Reply> {
  const d = await dayLog(ctx.viewer, ctx.viewer.profileId, today());
  if (!d.items.length) return reply("You haven't logged any food today.");
  return reply(`Today you've logged ${d.totals.kcal} kcal (protein ${d.totals.protein} g, carbs ${d.totals.carbs} g, fat ${d.totals.fat} g)${d.target ? ` against a target of ${d.target.kcal} kcal` : ""}.${d.hasEstimates ? " Some entries are estimates." : ""}`);
}

async function billsAnswer(): Promise<Reply> {
  const list = (await billOccurrences(addDays(today(), -60), addDays(today(), 30))).filter((b) => b.status !== "PAID" && !b.projected);
  if (!list.length) return reply("No unpaid bills are due in the next 30 days.");
  const overdue = list.filter((b) => b.date < today());
  return reply(`${list.length} unpaid bill(s)${overdue.length ? `, ${overdue.length} overdue` : ""}. HomeOS tracks bills — it doesn't make payments.`, [{ type: "list", title: "Bills", items: list.map((b) => ({ label: b.name, detail: `${formatCents(b.amountCents)} · ${relativeDay(b.date)}`, tone: b.date < today() ? "warn" : "muted", href: "/money/bills" })) }]);
}

async function spendingAnswer(ctx: Ctx): Promise<Reply> {
  const month = monthOf(today());
  const [cur, prev] = await Promise.all([monthSummary(month), monthSummary(addMonthsToMonth(month, -1))]);
  const cat = cur.rows.find((r) => ctx.lower.includes(r.key) || ctx.lower.includes(r.name.toLowerCase().split(" ")[0]));
  if (cat) {
    const p = prev.rows.find((r) => r.key === cat.key)!;
    const diff = cat.spent - p.spent;
    return reply(`${cat.name}: ${formatCents(cat.spent)} so far this month vs ${formatCents(p.spent)} for all of last month${cat.budget ? ` (budget ${formatCents(cat.budget)})` : ""}. ${diff > 0 ? `That's already ${formatCents(diff)} more.` : `That's ${formatCents(-diff)} less so far.`} (Month-to-date figures are not a full-month comparison.)`);
  }
  return reply(`Recorded spending this month: ${formatCents(cur.total)} (last month: ${formatCents(prev.total)}).`, [{ type: "list", title: "By category", items: cur.rows.filter((r) => r.spent).sort((a, b) => b.spent - a.spent).map((r) => ({ label: r.name, detail: `${formatCents(r.spent)}${r.budget ? ` of ${formatCents(r.budget)}` : ""}`, tone: r.budget && r.spent > r.budget ? "warn" : "muted", href: `/money/expenses?category=${r.key}` })) }]);
}

async function priceAnswer(ctx: Ctx): Promise<Reply> {
  if (/increas|gone up|more expensive|went up/.test(ctx.lower)) {
    const ch = (await priceChanges()).filter((c) => c.changePct > 0.5);
    if (!ch.length) return reply("No recorded price increases yet (needs at least two recorded prices for the same product and package).");
    return reply("Recorded price increases (from your receipts and manual entries — not live market prices):", [{ type: "list", title: "Price increases", items: ch.slice(0, 10).map((c) => { const u = unitPriceDisplay(c.latest, c.normalizedUnit); return { label: `${c.product} (${c.variant})`, detail: `+${c.changePct.toFixed(1)}% since ${formatDate(c.firstDate)} · now ${formatCents(Math.round(u.value))}/${u.label}`, tone: "warn" as const, href: `/money/prices?product=${c.productId}` }; }) }]);
  }
  if (/switch|save by|saving/.test(ctx.lower)) {
    const s = await brandSwitchSavings(90);
    if (!s.length) return reply("Not enough price history yet: I need purchases of at least two brands/sizes of the same product.");
    const total = s.reduce((a, x) => a + x.potentialSavingsCents, 0);
    return reply(`Over the last 90 days, buying the cheapest recorded option would have saved about ${formatCents(total)}. Based on recorded prices only.`, [{ type: "list", title: "Potential savings", items: s.slice(0, 8).map((x) => ({ label: x.product, detail: `${formatCents(x.potentialSavingsCents)} · cheapest: ${x.cheapest}`, href: `/money/prices?product=${x.productId}` })) }]);
  }
  // Product-specific: find the product named in the question.
  const products = await prisma.product.findMany({ select: { id: true, name: true } });
  const qt = tokens(ctx.lower);
  const match = products.map((p) => ({ p, s: tokens(p.name).filter((t) => qt.includes(t)).length / tokens(p.name).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
  if (!match) return reply("I couldn't find that product in your price history. Prices are recorded from saved receipts or the Prices page.");
  const cmp = await productComparison(match.p.id);
  if (!cmp.variants.length) return reply(`No prices recorded for ${match.p.name} yet.`);
  const best = cmp.variants[0];
  const u = unitPriceDisplay(best.latest.unitPrice, best.normalizedUnit);
  const store = cmp.stores[0];
  const intro = /store|where/.test(ctx.lower) && store
    ? `The lowest recorded price for ${cmp.product.name} was at ${store.store}.`
    : /larger|bigger|bulk|package/.test(ctx.lower)
      ? `Comparing package sizes of ${cmp.product.name} by unit price:`
      : `Cheapest recorded option for ${cmp.product.name}: ${best.label} at ${formatCents(Math.round(u.value))}/${u.label}.`;
  return reply(`${intro} (Recorded purchases, not live prices.)`, [{ type: "list", title: `${cmp.product.name} — by unit price`, items: cmp.variants.map((v, i) => { const d = unitPriceDisplay(v.latest.unitPrice, v.normalizedUnit); return { label: v.label, detail: `${formatCents(Math.round(d.value))}/${d.label} · ${formatCents(v.latest.priceCents)} on ${formatDate(v.latest.date)}${v.latest.store ? ` @ ${v.latest.store}` : ""}`, badge: i === 0 ? "cheapest" : undefined, tone: (i === 0 ? "ok" : "muted") as "ok" | "muted", href: `/money/prices?product=${cmp.product.id}` }; }) }]);
}

async function todayAnswer(ctx: Ctx): Promise<Reply> {
  const day = /tomorrow/.test(ctx.lower) ? addDays(today(), 1) : today();
  const to = /week/.test(ctx.lower) ? addDays(day, 6) : day;
  const items = (await calendarItems(ctx.viewer, day, to)).filter((i) => !i.skipped);
  if (!items.length) return reply(`Nothing scheduled ${day === to ? relativeDay(day).toLowerCase() : "this week"}.`);
  return reply(`${items.length} item(s) ${day === to ? relativeDay(day).toLowerCase() : "this week"}:`, [{ type: "list", title: day === to ? formatDate(day, { weekday: true }) : "This week", items: items.slice(0, 30).map((i) => ({ label: i.title, detail: [day === to ? null : `${weekdayName(weekday(i.date))}`, i.time, i.kind, i.sub].filter(Boolean).join(" · "), tone: i.done ? "ok" : "muted", href: i.href, badge: i.done ? "done" : undefined })) }]);
}

async function projectAnswer(ctx: Ctx): Promise<Reply> {
  const { proposal, notes } = buildProjectProposal(ctx.text);
  const action = await proposeAction(ctx.viewer, "PROJECT_CREATE", `Create private project "${proposal.name}"`, { def: proposal }, ctx.conversationId);
  return reply(`Here's a proposed structure for "${proposal.name}". It will be private to you. ${notes.join(" ")} You can also refine it in the Project Builder.`, [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: proposal }]);
}

async function groceryAdd(ctx: Ctx, body: string): Promise<Reply> {
  const parts = body.split(/,|\band\b/).map((p) => parseIngredientLine(p.trim())).filter((p) => p.name);
  if (!parts.length) return reply("What should I add?");
  const items = parts.map((p) => ({ name: p.name, quantity: p.quantity ?? 1, unit: p.quantity === null ? "each" : p.unit || "each" }));
  const action = await proposeAction(ctx.viewer, "GROCERY_ADD", `Add ${items.map((i) => i.name).join(", ")} to the shopping list`, { items }, ctx.conversationId);
  return reply("Add these to the shopping list? Duplicates are merged automatically.", [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: { items } }]);
}

async function targetsAnswer(ctx: Ctx): Promise<Reply> {
  const m = ctx.lower.match(/(\d{3,4})\s*(?:k?cal|calories)/);
  if (!m) return reply("Tell me the daily calories, e.g. “set my calorie target to 1900”. Or use “Estimate targets” on your profile page.");
  const kcal = Number(m[1]);
  const payload = { profileId: ctx.viewer.profileId, kcal, protein: Math.round((kcal * 0.25) / 4), carbs: Math.round((kcal * 0.45) / 4), fat: Math.round((kcal * 0.3) / 9), fibre: Math.round((kcal / 1000) * 14), method: "MANUAL" };
  const action = await proposeAction(ctx.viewer, "NUTRITION_TARGETS", `Set your daily target to ${kcal} kcal`, payload, ctx.conversationId);
  return reply("Proposed new targets (macro split 25/45/30 % energy — edit on your profile if you prefer different values). Future meal portions will use them.", [{ type: "action", actionId: action.id, kind: action.kind, summary: action.summary, preview: payload }]);
}

const HELP = `I work from your recorded data. Try:
• “What can I cook today?” / “What can I make without shopping?”
• “What can I cook with 500g chicken thighs, spinach and mushrooms?”
• “What vegetables are left?” / “What is expiring?”
• “We bought 2 kg rice and 6 eggs” (updates pantry after you approve)
• “Add 1 cup boiled rice to my lunch today” / “I had 2 eggs for breakfast” (meal plan & nutrition log)
• “Plan seven days of dinners using our pantry, under $120, no chicken more than twice”
• “What's missing for garlic butter chicken?” / “What should I buy?”
• “Which bills are due?” / “Are we spending more on groceries this month?”
• “Which store has the lowest price for milk?” / “Which products increased in price?”
• “What's happening today?” / “Create a daily reading tracker”`;

const HANDLERS: Handler[] = [
  { test: (t) => /^(help|what can you do|\?)$/.test(t.trim()), run: async () => reply(HELP) },
  { test: (t) => /\bplan\b.*\b(meals?|dinners?|lunch(es)?|breakfasts?|week|days?)\b/.test(t), run: mealPlanAnswer },
  { test: (t) => /\b(create|make|build|start|set up)\b.*\b(journal|tracker|diary|project|log)\b/.test(t) && !/shopping|grocery/.test(t), run: projectAnswer },
  { test: (t) => parseMealRequest(t, today()) !== null, run: mealAdd },
  { test: (t) => /\badd\b.+\bto (the |my |our )?(shopping|grocery) list\b/.test(t), run: (c) => groceryAdd(c, c.text.replace(/^.*?\badd\b/i, "").replace(/\bto (the |my |our )?(shopping|grocery) list.*$/i, "")) },
  { test: (t) => /^(we |i )?(just )?(bought|got|picked up|added|add|used|use|ate|finished|threw (out|away)|consumed|have only|only have)\b/.test(t) || /\b(went bad|spoiled)\b/.test(t), run: inventoryChange },
  { test: (t) => /\b(set|change|update)\b.*\b(calorie|kcal)\b.*\btarget\b|\btarget\b.*\b\d{3,4}\s*(k?cal|calories)\b/.test(t), run: targetsAnswer },
  { test: (t) => /\b(expir|going off|go bad|use up soon|about to go)/.test(t), run: expiringAnswer },
  { test: (t) => /\b(cook|make)\b.*\b(with|using)\b/.test(t) && !/without/.test(t), run: (c) => cookWith(c, c.text.replace(/^.*?\b(with|using)\b/i, "").replace(/\?$/, "")) },
  { test: (t) => /\bwithout (going )?(grocery )?shopping\b|\bonly (with )?what we have\b|\bwithout buying\b/.test(t), run: (c) => whatCanICook(c, true) },
  { test: (t) => /\bwhat can (i|we) (cook|make)\b|\bwhat should (i|we) (cook|make|eat)\b|\bdinner ideas?\b/.test(t), run: (c) => whatCanICook(c, false) },
  { test: (t) => /\b(missing|need|lack)\b.*\b(for|to make)\b/.test(t), run: (c) => missingFor(c, c.text.replace(/^.*\b(for|to make)\b/i, "").replace(/\?$/, "")) },
  { test: (t) => /\b(what|anything) (should|do) (i|we) (buy|need to buy|need)\b|\bshopping list\b|\bwhat to buy\b|\blow (on|stock)\b/.test(t), run: shoppingAnswer },
  { test: (t) => /\b(calories|kcal|protein|macros)\b.*\b(today|eaten|had)\b/.test(t), run: caloriesAnswer },
  { test: (t) => /\bbills?\b|\bdue\b.*\bpay/.test(t), run: billsAnswer },
  { test: (t) => /\b(cheapest|lowest (recorded )?price|cheaper|price of|prices?|increased in price|save by switching|switching brands|larger package|bigger pack)/.test(t), run: priceAnswer },
  { test: (t) => /\b(spend|spent|spending|expenses?)\b/.test(t), run: spendingAnswer },
  { test: (t) => /\b(what('?s| is) (on|happening)|schedule|agenda|today|tomorrow|this week)\b/.test(t) && !/cook|eat|make/.test(t), run: todayAnswer },
  { test: (t) => /\b(what|which)\b.*\b(have|left|got|in (the )?(pantry|fridge|freezer|stock))\b|\bingredients do we have\b|\binventory\b/.test(t), run: pantryAnswer },
];

async function groundedFallback(ctx: Ctx): Promise<Reply> {
  const model = await getLocalModel();
  if (!model) return reply(`I'm not sure how to answer that with the rule-based assistant. ${HELP}`);
  const pantry = await listPantry();
  const meals = await prisma.mealPlanItem.findMany({ where: { date: { gte: today(), lte: addDays(today(), 3) } } });
  const recipes = await prisma.recipe.findMany({ select: { name: true }, take: 80 });
  const context = {
    today: today(),
    pantry: pantry.map((p) => ({ item: p.name, quantity: p.quantity, unit: p.unit, confidence: p.confidence, expiry: p.expiryDate })),
    upcomingMeals: meals.map((m) => ({ date: m.date, slot: m.slot, title: m.title })),
    savedRecipes: recipes.map((r) => r.name),
  };
  try {
    const text = await model.complete({
      system: "You are the HomeOS household assistant. Answer ONLY using the JSON context provided. If the answer is not in the context, say you don't have that information. Never invent quantities, prices or nutrition facts. When a pantry quantity has confidence ESTIMATED or UNVERIFIED, say so. Be concise.",
      prompt: `Context:\n${JSON.stringify(context)}\n\nQuestion: ${ctx.text}`,
      maxTokens: 400,
    });
    return { text: text.trim() || "I don't have that information.", cards: [{ type: "note", text: `Answered by local AI (${model.label}) from your pantry, meal plan and recipe list only.` }], provider: model.id };
  } catch {
    return reply(`The local AI didn't respond. ${HELP}`);
  }
}

export async function handleMessage(viewer: Viewer, input: { text: string; conversationId?: string | null; surface: string }) {
  const text = input.text.trim().slice(0, 2000);
  if (!text) throw new Error("Empty message");
  let conv = input.conversationId ? await prisma.aIConversation.findFirst({ where: { id: input.conversationId, profileId: viewer.profileId } }) : null;
  if (!conv) conv = await prisma.aIConversation.create({ data: { profileId: viewer.profileId, assistant: input.surface, title: text.slice(0, 80) } });
  await prisma.aIMessage.create({ data: { conversationId: conv.id, role: "user", content: text } });
  const ctx: Ctx = { viewer, text, lower: text.toLowerCase(), conversationId: conv.id, surface: input.surface };
  let result: Reply;
  try {
    const handler = HANDLERS.find((h) => h.test(ctx.lower));
    result = handler ? await handler.run(ctx) : await groundedFallback(ctx);
  } catch (e) {
    result = reply(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
  }
  const msg = await prisma.aIMessage.create({ data: { conversationId: conv.id, role: "assistant", content: result.text, data: JSON.stringify({ cards: result.cards }), provider: result.provider } });
  return { conversationId: conv.id, message: { id: msg.id, role: "assistant", content: result.text, cards: result.cards, provider: result.provider } };
}

export async function conversationHistory(viewer: Pick<Viewer, "profileId">, conversationId: string) {
  const conv = await prisma.aIConversation.findFirst({ where: { id: conversationId, profileId: viewer.profileId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!conv) return null;
  const actionIds = conv.messages.flatMap((m) => (m.data ? (JSON.parse(m.data).cards as Card[]).filter((c) => c.type === "action").map((c) => (c as { actionId: string }).actionId) : []));
  const actions = await prisma.aIAction.findMany({ where: { id: { in: actionIds } }, select: { id: true, status: true, result: true } });
  return { ...conv, actions };
}
