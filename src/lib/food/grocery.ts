import { isFreeStaple } from "./staples";
import { shoppingAmount } from "./shop-units";
import { prisma, type Tx } from "../db";
import { convert, normalizeUnit, toBase, dimensionOf, packagesNeeded, formatQuantity } from "../units";
import { availabilityFrom, pantryByFood, addToPantry } from "./pantry";
import { bestRecentPriceForFood, recordPrice, upsertStore } from "../finance/prices";
import { servingsToCook } from "./mealplan";
import { ensureFoodItem, canonicalKey } from "./catalog";
import { today, addDays } from "../dates";
import { round } from "../utils";
import { audit } from "../audit";
import { getSetting, setSetting } from "../settings";
import type { FoodItem } from "@prisma/client";
import { ensureCategory } from "../finance/ledger";

export interface Requirement {
  key: string;
  foodItemId: string | null;
  name: string;
  unit: string;
  required: number | null; // null = "as needed"
  inPantry: number;
  toBuy: number | null;
  pantryConfidence: string;
  recipes: string[];
  food: FoodItem | null;
}

/**
 * Ingredients required by planned (not cooked/skipped, not leftover) meals in [from, to],
 * scaled by each meal's total servings, minus confirmed pantry stock. Deterministic.
 */
export async function computeRequirements(from: string, to: string, tx: Tx = prisma): Promise<Requirement[]> {
  const items = await tx.mealPlanItem.findMany({
    where: { date: { gte: from, lte: to }, status: "PLANNED", recipeId: { not: null } },
    include: { servings: true, recipe: { include: { ingredients: { include: { foodItem: true } } } } },
  });
  const leftovers = await tx.mealPlanItem.findMany({ where: { leftoverFromId: { in: items.map((i) => i.id) } }, include: { servings: true } });
  const acc = new Map<string, Requirement>();
  for (const item of items) {
    if (!item.recipe || item.isLeftover) continue;
    const total = servingsToCook(item, leftovers);
    const servings = total > 0 ? total : item.recipe.servings;
    const factor = servings / item.recipe.servings;
    for (const ing of item.recipe.ingredients) {
      if (isFreeStaple(ing.name)) continue;
      const food = ing.foodItem;
      const foodKey = food?.id ?? `name:${canonicalKey(ing.name)}`;
      if (ing.quantity === null) {
        const key = `${foodKey}|asneeded`;
        if (ing.optional) continue;
        const ex = acc.get(key);
        if (ex) { if (!ex.recipes.includes(item.title)) ex.recipes.push(item.title); continue; }
        acc.set(key, { key, foodItemId: food?.id ?? null, name: food?.name ?? ing.name, unit: "", required: null, inPantry: 0, toBuy: null, pantryConfidence: "—", recipes: [item.title], food });
        continue;
      }
      const qty = ing.quantity * factor;
      // Aggregate in the food's default unit when convertible, otherwise in the ingredient's own base unit.
      const target = food ? normalizeUnit(food.defaultUnit) : toBase(1, ing.unit).unit;
      let unit = target;
      let amount = convert(qty, ing.unit, target, food);
      if (amount === null) {
        const b = toBase(qty, ing.unit);
        unit = b.unit;
        amount = b.qty;
      }
      const key = `${foodKey}|${dimensionOf(unit) === "other" ? unit : dimensionOf(unit)}`;
      const ex = acc.get(key);
      if (ex) {
        const add = convert(amount, unit, ex.unit, food) ?? amount;
        ex.required = (ex.required ?? 0) + add;
        if (!ex.recipes.includes(item.title)) ex.recipes.push(item.title);
      } else {
        acc.set(key, { key, foodItemId: food?.id ?? null, name: food?.name ?? ing.name, unit, required: amount, inPantry: 0, toBuy: amount, pantryConfidence: "—", recipes: [item.title], food });
      }
    }
  }
  const stock = await pantryByFood(tx);
  for (const r of acc.values()) {
    const items = (r.foodItemId && stock.get(r.foodItemId)) || stock.get(`name:${r.name.toLowerCase()}`) || [];
    if (r.required === null) {
      r.inPantry = items.length ? 1 : 0;
      r.toBuy = items.length ? 0 : null;
      r.pantryConfidence = items[0]?.confidence ?? "—";
      continue;
    }
    const avail = availabilityFrom(items, r.food ?? { gramsPerMl: null, gramsPerEach: null }, r.unit);
    r.inPantry = round(avail.quantity, 3);
    r.toBuy = round(Math.max(0, r.required - avail.quantity), 3);
    r.required = round(r.required, 3);
    r.pantryConfidence = items.length ? avail.confidence : "—";
  }
  return [...acc.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveList(tx: Tx = prisma) {
  const existing = await tx.groceryList.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  return existing ?? tx.groceryList.create({ data: { name: "Shopping list" } });
}

export async function getGroceryRange() {
  const from = await getSetting("grocery.from", today());
  const to = await getSetting("grocery.to", addDays(today(), 6));
  return { from: from < today() ? today() : from, to: to < today() ? addDays(today(), 6) : to };
}

/** Price estimate for buying `qty unit` of a food, using recorded prices (never invented). */
export async function estimatePrice(food: FoodItem | null, qty: number, unit: string, tx: Tx = prisma) {
  if (!food || qty <= 0) return null;
  const best = await bestRecentPriceForFood(food.id, 365, tx);
  if (!best) return null;
  const need = convert(qty, unit, best.normalizedUnit === "each" ? "each" : best.normalizedUnit, food);
  if (need === null) return null;
  const pkgBase = toBase(best.variant.packageSize, best.variant.packageUnit);
  const packs = pkgBase.dim !== "other" ? packagesNeeded(need, pkgBase.qty) : null;
  const cents = packs ? packs * best.priceCents : Math.round(need * best.unitPrice);
  const brand = best.variant.brand?.name;
  return {
    cents,
    packageNote: packs ? `${packs} × ${formatQuantity(best.variant.packageSize, best.variant.packageUnit)}${brand ? ` ${brand}` : ""}${best.store ? ` @ ${best.store.name}` : ""}` : "",
    storeId: best.storeId,
    basedOn: `${best.source.toLowerCase()} price from ${best.date}`,
  };
}

/**
 * Recalculates meal-plan-derived items on the active list for the stored planning range.
 * Manual items are untouched; checked items are kept; stale unchecked meal items are removed.
 */
export async function syncMealPlanGroceries(range?: { from: string; to: string }) {
  const r = range ?? (await getGroceryRange());
  if (range) { await setSetting("grocery.from", range.from); await setSetting("grocery.to", range.to); }
  return prisma.$transaction(async (tx) => {
    const list = await getActiveList(tx);
    const reqs = await computeRequirements(r.from, r.to, tx);
    const existing = await tx.groceryItem.findMany({ where: { listId: list.id, source: "MEAL_PLAN" } });
    const keep = new Set<string>();
    for (const req of reqs) {
      if (req.toBuy !== null && req.toBuy <= 1e-6) continue;
      // What you'd actually buy: a pack of spice, 1 cauliflower, 500 g chicken — not recipe crumbs.
      const shop = shoppingAmount(req.name, req.toBuy, req.unit, req.food, req.pantryConfidence !== "—");
      if (shop.skip) continue;
      const sourceKey = `meal:${req.key}`;
      keep.add(sourceKey);
      const est = await estimatePrice(req.food, shop.quantity, shop.unit, tx);
      const found = existing.find((e) => e.sourceKey === sourceKey);
      const data = { name: req.name, foodItemId: req.foodItemId, quantity: shop.quantity, unit: shop.unit, estimatedPriceCents: est?.cents ?? null, packageNote: [`for ${req.recipes.slice(0, 3).join(", ")}`, shop.recipeUses ? `recipe uses ${shop.recipeUses}` : "", est?.packageNote].filter(Boolean).join(" · "), storeId: est?.storeId ?? null };
      if (found) {
        if (!found.checked) await tx.groceryItem.update({ where: { id: found.id }, data });
      } else {
        await tx.groceryItem.create({ data: { ...data, listId: list.id, source: "MEAL_PLAN", sourceKey } });
      }
    }
    for (const e of existing) if (!keep.has(e.sourceKey ?? "") && !e.checked) await tx.groceryItem.delete({ where: { id: e.id } });
    return { listId: list.id, range: r, count: keep.size };
  });
}

/** Adds an item; merges with an unchecked item for the same food + unit dimension (duplicate prevention). */
export async function addGroceryItem(input: { name: string; quantity: number; unit: string; source?: string; note?: string }, tx: Tx = prisma) {
  const list = await getActiveList(tx);
  const unit = normalizeUnit(input.unit || "each");
  const food = await ensureFoodItem(input.name, tx, undefined, { unit });
  const candidates = await tx.groceryItem.findMany({ where: { listId: list.id, foodItemId: food.id, checked: false } });
  for (const c of candidates) {
    const add = convert(input.quantity, unit, c.unit, food);
    if (add !== null) {
      const quantity = round(c.quantity + add, 3);
      const est = await estimatePrice(food, quantity, c.unit, tx);
      return { item: await tx.groceryItem.update({ where: { id: c.id }, data: { quantity, estimatedPriceCents: est?.cents ?? c.estimatedPriceCents } }), merged: true };
    }
  }
  const est = await estimatePrice(food, input.quantity, unit, tx);
  const item = await tx.groceryItem.create({
    data: { listId: list.id, foodItemId: food.id, name: food.name, quantity: input.quantity, unit, source: input.source ?? "MANUAL", estimatedPriceCents: est?.cents ?? null, packageNote: [est?.packageNote, input.note].filter(Boolean).join(" · "), storeId: est?.storeId ?? null },
  });
  return { item, merged: false };
}

export interface CompleteShoppingInput {
  listId: string;
  storeName?: string;
  totalCents?: number | null;
  createExpense: boolean;
  addToPantry: boolean;
  recordPrices: boolean;
  paidByProfileId?: string | null;
  date?: string;
}

/** Shopping → Pantry → Money → Prices, in one transaction. */
export async function completeShopping(input: CompleteShoppingInput, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const list = await tx.groceryList.findUniqueOrThrow({ where: { id: input.listId }, include: { items: { include: { foodItem: true } } } });
    const bought = list.items.filter((i) => i.checked);
    if (!bought.length) throw new Error("Tick the items you bought first");
    const date = input.date ?? today();
    const store = await upsertStore(input.storeName, tx);
    const itemsTotal = bought.reduce((a, i) => a + (i.actualPriceCents ?? 0), 0);
    const total = input.totalCents ?? (itemsTotal || null);
    let expenseId: string | null = null;
    if (input.createExpense) {
      if (!total) throw new Error("Enter the total paid (or item prices) to record an expense");
      const cat = await ensureCategory("groceries", tx);
      const exp = await tx.expense.create({
        data: { date, amountCents: total, merchant: store?.name ?? "Groceries", description: `Shopping: ${bought.length} items`, categoryId: cat.id, paidByProfileId: input.paidByProfileId ?? profileId, source: "SHOPPING", createdByProfileId: profileId },
      });
      expenseId = exp.id;
    }
    for (const it of bought) {
      if (input.addToPantry && !it.addedToPantry && it.quantity > 0) {
        await addToPantry({ name: it.name, foodItemId: it.foodItemId, quantity: it.quantity, unit: it.unit, reason: "SHOPPING", refType: "groceryList", refId: list.id, profileId }, tx);
        await tx.groceryItem.update({ where: { id: it.id }, data: { addedToPantry: true } });
      }
      if (input.recordPrices && it.actualPriceCents && it.quantity > 0 && dimensionOf(it.unit) !== "other") {
        await recordPrice({ productName: it.name, foodItemId: it.foodItemId, packageSize: it.quantity, packageUnit: it.unit, storeName: store?.name, date, priceCents: it.actualPriceCents, source: "MANUAL" }, tx);
      }
    }
    await tx.shoppingHistory.create({ data: { groceryListId: list.id, storeId: store?.id ?? null, date, totalCents: total ?? 0, itemCount: bought.length, expenseId } });
    const remaining = list.items.filter((i) => !i.checked);
    await tx.groceryList.update({ where: { id: list.id }, data: { status: "COMPLETED", completedAt: new Date(), storeId: store?.id ?? null } });
    if (remaining.length) {
      const next = await tx.groceryList.create({ data: { name: "Shopping list" } });
      await tx.groceryItem.updateMany({ where: { id: { in: remaining.map((r) => r.id) } }, data: { listId: next.id } });
    }
    await audit({ profileId, action: "shopping.complete", entityType: "groceryList", entityId: list.id, summary: `${bought.length} items${total ? `, ${(total / 100).toFixed(2)}` : ""}` }, tx);
    return { expenseId, bought: bought.length, carriedOver: remaining.length };
  });
}
