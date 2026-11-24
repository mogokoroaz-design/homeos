import { prisma, type Tx } from "../db";
import { convert, normalizeUnit } from "../units";
import { addDays, today } from "../dates";
import { ensureFoodItem, loadFoodIndex } from "./catalog";
import type { FoodItem, PantryItem } from "@prisma/client";
import { round } from "../utils";

export type PantryWithFood = PantryItem & { foodItem: FoodItem | null };

export async function listPantry(filter: { location?: string; q?: string } = {}) {
  return prisma.pantryItem.findMany({
    where: {
      quantity: { gt: 0 },
      ...(filter.location ? { location: filter.location } : {}),
      ...(filter.q ? { name: { contains: filter.q } } : {}),
    },
    include: { foodItem: true },
    orderBy: [{ expiryDate: "asc" }, { name: "asc" }],
  });
}

export interface Availability {
  /** Quantity available expressed in `unit`, or null if units are not convertible. */
  quantity: number;
  unit: string;
  confidence: "CONFIRMED" | "ESTIMATED" | "UNVERIFIED";
  items: PantryWithFood[];
  unconvertible: PantryWithFood[];
}

const CONF_RANK = { CONFIRMED: 0, ESTIMATED: 1, UNVERIFIED: 2 } as const;

/** Sum of pantry stock for a food item, converted into `unit`. */
export function availabilityFrom(items: PantryWithFood[], food: Pick<FoodItem, "gramsPerMl" | "gramsPerEach">, unit: string): Availability {
  let quantity = 0;
  let confidence: Availability["confidence"] = "CONFIRMED";
  const used: PantryWithFood[] = [];
  const unconvertible: PantryWithFood[] = [];
  for (const it of items) {
    const q = convert(it.quantity, it.unit, unit, food);
    if (q === null) { unconvertible.push(it); continue; }
    quantity += q;
    used.push(it);
    const c = it.confidence as Availability["confidence"];
    if (CONF_RANK[c] > CONF_RANK[confidence]) confidence = c;
  }
  return { quantity, unit, confidence, items: used, unconvertible };
}

export async function pantryByFood(tx: Tx = prisma) {
  const items = await tx.pantryItem.findMany({ where: { quantity: { gt: 0 } }, include: { foodItem: true } });
  const map = new Map<string, PantryWithFood[]>();
  for (const it of items) {
    const key = it.foodItemId ?? `name:${it.name.toLowerCase()}`;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return map;
}

export interface PantryAddInput {
  name: string;
  foodItemId?: string | null;
  quantity: number;
  unit: string;
  location?: string;
  expiryDate?: string | null;
  purchaseDate?: string | null;
  lowStockThreshold?: number | null;
  confidence?: "CONFIRMED" | "ESTIMATED" | "UNVERIFIED";
  reason?: "PURCHASE" | "ADJUST" | "RECEIPT" | "SHOPPING";
  refType?: string;
  refId?: string;
  profileId?: string | null;
}

export async function addToPantry(input: PantryAddInput, tx: Tx = prisma) {
  const unit = normalizeUnit(input.unit);
  const food = input.foodItemId
    ? await tx.foodItem.findUniqueOrThrow({ where: { id: input.foodItemId } })
    : await ensureFoodItem(input.name, tx, undefined, { unit });
  const location = input.location ?? defaultLocation(food.category);
  const existing = await tx.pantryItem.findFirst({
    where: { foodItemId: food.id, location, unit, expiryDate: input.expiryDate ?? null, quantity: { gt: 0 } },
  });
  const item = existing
    ? await tx.pantryItem.update({
        where: { id: existing.id },
        data: {
          quantity: round(existing.quantity + input.quantity, 3),
          originalQuantity: round((existing.originalQuantity ?? existing.quantity) + input.quantity, 3),
          confidence: input.confidence ?? existing.confidence,
          ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
        },
      })
    : await tx.pantryItem.create({
        data: {
          foodItemId: food.id,
          name: food.name,
          quantity: input.quantity,
          originalQuantity: input.quantity,
          unit,
          location,
          expiryDate: input.expiryDate ?? null,
          purchaseDate: input.purchaseDate ?? today(),
          lowStockThreshold: input.lowStockThreshold ?? null,
          confidence: input.confidence ?? "CONFIRMED",
        },
      });
  await tx.inventoryTransaction.create({
    data: {
      pantryItemId: item.id, foodItemId: food.id, name: food.name, delta: input.quantity, unit,
      reason: input.reason ?? "PURCHASE", refType: input.refType, refId: input.refId, profileId: input.profileId ?? null,
    },
  });
  return item;
}

function defaultLocation(category: string) {
  if (["meat", "seafood", "dairy"].includes(category)) return "FRIDGE";
  if (category === "frozen") return "FREEZER";
  if (["vegetable", "fruit"].includes(category)) return "FRIDGE";
  return "PANTRY";
}

export interface ConsumeResult { consumed: number; shortfall: number; unit: string; touched: string[] }

/** Deducts stock first-expiring-first. Returns any shortfall (never goes negative). */
export async function consumeFood(
  args: { foodItemId: string; quantity: number; unit: string; reason: "CONSUME" | "MEAL" | "WASTE"; refType?: string; refId?: string; profileId?: string | null },
  tx: Tx = prisma,
): Promise<ConsumeResult> {
  const food = await tx.foodItem.findUniqueOrThrow({ where: { id: args.foodItemId } });
  const items = await tx.pantryItem.findMany({ where: { foodItemId: food.id, quantity: { gt: 0 } } });
  items.sort((a, b) => (a.expiryDate ?? "9999") .localeCompare(b.expiryDate ?? "9999"));
  let remaining = args.quantity;
  const touched: string[] = [];
  for (const it of items) {
    if (remaining <= 1e-9) break;
    const availableInArgUnit = convert(it.quantity, it.unit, args.unit, food);
    if (availableInArgUnit === null || availableInArgUnit <= 0) continue;
    const take = Math.min(remaining, availableInArgUnit);
    const takeInItemUnit = convert(take, args.unit, it.unit, food)!;
    const newQty = round(it.quantity - takeInItemUnit, 3);
    await tx.pantryItem.update({ where: { id: it.id }, data: { quantity: newQty <= 1e-6 ? 0 : newQty } });
    await tx.inventoryTransaction.create({
      data: { pantryItemId: it.id, foodItemId: food.id, name: food.name, delta: -round(takeInItemUnit, 3), unit: it.unit, reason: args.reason, refType: args.refType, refId: args.refId, profileId: args.profileId ?? null },
    });
    touched.push(it.id);
    remaining -= take;
  }
  return { consumed: round(args.quantity - Math.max(0, remaining), 3), shortfall: round(Math.max(0, remaining), 3), unit: args.unit, touched };
}

export async function setPantryQuantity(pantryItemId: string, quantity: number, profileId: string | null, tx: Tx = prisma) {
  const it = await tx.pantryItem.findUniqueOrThrow({ where: { id: pantryItemId } });
  const delta = round(quantity - it.quantity, 3);
  await tx.pantryItem.update({ where: { id: it.id }, data: { quantity: Math.max(0, quantity), confidence: "CONFIRMED" } });
  if (delta !== 0) {
    await tx.inventoryTransaction.create({ data: { pantryItemId: it.id, foodItemId: it.foodItemId, name: it.name, delta, unit: it.unit, reason: "ADJUST", profileId } });
  }
}

export async function wastePantryItem(pantryItemId: string, profileId: string | null, tx: Tx = prisma) {
  const it = await tx.pantryItem.findUniqueOrThrow({ where: { id: pantryItemId } });
  if (it.quantity > 0) {
    await tx.inventoryTransaction.create({ data: { pantryItemId: it.id, foodItemId: it.foodItemId, name: it.name, delta: -it.quantity, unit: it.unit, reason: "WASTE", profileId } });
  }
  await tx.pantryItem.update({ where: { id: it.id }, data: { quantity: 0 } });
}

export async function expiringSoon(days = 3) {
  const limit = addDays(today(), days);
  return prisma.pantryItem.findMany({
    where: { quantity: { gt: 0 }, expiryDate: { not: null, lte: limit } },
    include: { foodItem: true },
    orderBy: { expiryDate: "asc" },
  });
}

export async function lowStock() {
  const items = await prisma.pantryItem.findMany({ where: { lowStockThreshold: { not: null } }, include: { foodItem: true } });
  // Aggregate per food: low if total stock ≤ threshold.
  const byFood = new Map<string, PantryWithFood[]>();
  for (const it of items) byFood.set(it.foodItemId ?? it.id, [...(byFood.get(it.foodItemId ?? it.id) ?? []), it]);
  const out: { name: string; foodItemId: string | null; quantity: number; unit: string; threshold: number }[] = [];
  for (const list of byFood.values()) {
    const ref = list[0];
    const all = ref.foodItemId ? await prisma.pantryItem.findMany({ where: { foodItemId: ref.foodItemId, quantity: { gt: 0 } }, include: { foodItem: true } }) : list;
    const avail = availabilityFrom(all, ref.foodItem ?? { gramsPerMl: null, gramsPerEach: null }, ref.unit);
    if (avail.quantity <= (ref.lowStockThreshold ?? 0)) out.push({ name: ref.name, foodItemId: ref.foodItemId, quantity: round(avail.quantity, 2), unit: ref.unit, threshold: ref.lowStockThreshold ?? 0 });
  }
  return out;
}

export interface InventoryChange {
  action: "ADD" | "CONSUME" | "WASTE" | "SET";
  name: string;
  foodItemId?: string | null;
  quantity: number | null;
  unit: string;
  location?: string | null;
  expiryDate?: string | null;
  confidence?: "CONFIRMED" | "ESTIMATED" | "UNVERIFIED";
}

/** Applies approved inventory changes atomically. Returns human readable results. */
export async function applyInventoryChanges(changes: InventoryChange[], profileId: string | null, ref?: { type: string; id: string }) {
  return prisma.$transaction(async (tx) => {
    const index = await loadFoodIndex(tx);
    const results: string[] = [];
    for (const c of changes) {
      const unit = normalizeUnit(c.unit || "each");
      const food = c.foodItemId ? await tx.foodItem.findUniqueOrThrow({ where: { id: c.foodItemId } }) : await ensureFoodItem(c.name, tx, index, { unit });
      if (c.action === "ADD") {
        if (c.quantity === null) { results.push(`Skipped ${food.name}: no quantity given`); continue; }
        await addToPantry({ name: food.name, foodItemId: food.id, quantity: c.quantity, unit, location: c.location ?? undefined, expiryDate: c.expiryDate ?? null, confidence: c.confidence ?? "CONFIRMED", reason: "PURCHASE", profileId, refType: ref?.type, refId: ref?.id }, tx);
        results.push(`Added ${c.quantity} ${unit} ${food.name}`);
      } else if (c.action === "CONSUME" || c.action === "WASTE") {
        if (c.quantity === null) {
          const items = await tx.pantryItem.findMany({ where: { foodItemId: food.id, quantity: { gt: 0 } } });
          for (const it of items) {
            if (c.action === "WASTE") await wastePantryItem(it.id, profileId, tx);
            else await setPantryQuantity(it.id, 0, profileId, tx);
          }
          results.push(`${c.action === "WASTE" ? "Discarded" : "Used up"} all ${food.name}`);
          continue;
        }
        const r = await consumeFood({ foodItemId: food.id, quantity: c.quantity, unit, reason: c.action === "WASTE" ? "WASTE" : "CONSUME", profileId, refType: ref?.type, refId: ref?.id }, tx);
        results.push(`${c.action === "WASTE" ? "Discarded" : "Used"} ${r.consumed} ${unit} ${food.name}${r.shortfall > 0 ? ` (pantry only had ${r.consumed}; ${r.shortfall} ${unit} not recorded)` : ""}`);
      } else if (c.action === "SET") {
        if (c.quantity === null) { results.push(`Skipped ${food.name}: no quantity given`); continue; }
        const items = await tx.pantryItem.findMany({ where: { foodItemId: food.id, quantity: { gt: 0 } } });
        if (!items.length) {
          await addToPantry({ name: food.name, foodItemId: food.id, quantity: c.quantity, unit, location: c.location ?? undefined, confidence: "CONFIRMED", reason: "ADJUST", profileId }, tx);
        } else {
          const [first, ...rest] = items;
          const q = convert(c.quantity, unit, first.unit, food) ?? c.quantity;
          await setPantryQuantity(first.id, q, profileId, tx);
          for (const r of rest) await setPantryQuantity(r.id, 0, profileId, tx);
        }
        results.push(`Set ${food.name} to ${c.quantity} ${unit}`);
      }
    }
    return results;
  });
}
