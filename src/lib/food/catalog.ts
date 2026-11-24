import { prisma, type Tx } from "../db";
import { normalizeName, singular, titleCase, tokens } from "../utils";
import { guessCategory } from "./categories";
import { categoryForGroup, getReferenceFood } from "./reference";
import type { FoodItem } from "@prisma/client";

export type FoodIndex = { items: FoodItem[]; aliases: Map<string, string> };

export async function loadFoodIndex(tx: Tx = prisma): Promise<FoodIndex> {
  const [items, aliases] = await Promise.all([tx.foodItem.findMany(), tx.ingredient.findMany()]);
  return { items, aliases: new Map(aliases.map((a) => [a.name, a.foodItemId])) };
}

export function canonicalKey(name: string) {
  return tokens(name).join(" ");
}

/** Finds the best FoodItem for a free-text ingredient name, or null. Deterministic. */
export function matchFood(index: FoodIndex, name: string): FoodItem | null {
  const key = canonicalKey(name);
  if (!key) return null;
  const aliasId = index.aliases.get(key);
  if (aliasId) return index.items.find((i) => i.id === aliasId) ?? null;
  const exact = index.items.find((i) => canonicalKey(i.name) === key);
  if (exact) return exact;
  const q = key.split(" ");
  let best: { item: FoodItem; score: number } | null = null;
  for (const item of index.items) {
    const words = canonicalKey(item.name).split(" ");
    const shared = words.filter((w) => q.includes(w)).length;
    if (!shared) continue;
    // All words of the catalogue name must appear in the query ("chicken thigh" ⊂ "boneless chicken thigh").
    if (shared < words.length) continue;
    const score = shared * 10 - (q.length - shared);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

/** Returns an existing FoodItem for the name or creates a bare one (no nutrition until linked). */
export async function ensureFoodItem(name: string, tx: Tx = prisma, index?: FoodIndex, hint?: { unit?: string }) {
  const idx = index ?? (await loadFoodIndex(tx));
  const found = matchFood(idx, name);
  if (found) return found;
  const clean = titleCase(normalizeName(name).split(" ").map((w, i, arr) => (i === arr.length - 1 ? singular(w) : w)).join(" "));
  const existing = await tx.foodItem.findUnique({ where: { name: clean } });
  if (existing) return existing;
  const unitDim = hint?.unit;
  const created = await tx.foodItem.create({
    data: {
      name: clean,
      category: guessCategory(clean),
      defaultUnit: unitDim && ["g", "ml", "each"].includes(unitDim) ? unitDim : "g",
    },
  });
  idx.items.push(created);
  return created;
}

/** Links a FoodItem to a USDA SR28 reference food, copying validated nutrition and household measures. */
export async function linkReference(foodItemId: string, ndb: string, tx: Tx = prisma) {
  const ref = getReferenceFood(ndb);
  if (!ref) throw new Error("Reference food not found");
  return tx.foodItem.update({
    where: { id: foodItemId },
    data: {
      usdaNdb: ref.ndb,
      kcalPer100g: ref.kcal,
      proteinPer100g: ref.protein,
      carbsPer100g: ref.carbs,
      fatPer100g: ref.fat,
      fibrePer100g: ref.fibre,
      gramsPerMl: ref.gramsPerMl ?? undefined,
      gramsPerEach: ref.gramsPerEach ?? undefined,
      nutritionSource: "USDA_SR28",
      nutritionVerified: true,
    },
  });
}

export async function createFoodFromReference(ndb: string, displayName: string, tx: Tx = prisma) {
  const ref = getReferenceFood(ndb);
  if (!ref) throw new Error("Reference food not found");
  const name = displayName.trim() || ref.name.split(",").slice(0, 2).join(",");
  const existing = await tx.foodItem.findUnique({ where: { name } });
  const defaultUnit = ref.gramsPerEach && ["fruit", "vegetable", "dairy_egg", "baked"].includes(ref.group) ? "each" : ref.group === "beverage" || (ref.gramsPerMl && /milk|juice|oil|stock|broth|vinegar|sauce/i.test(ref.name)) ? "ml" : "g";
  const base = existing ?? (await tx.foodItem.create({ data: { name, category: categoryForGroup(ref.group), defaultUnit } }));
  return linkReference(base.id, ndb, tx);
}

export async function addAlias(foodItemId: string, alias: string, tx: Tx = prisma) {
  const name = canonicalKey(alias);
  if (!name) return;
  await tx.ingredient.upsert({ where: { name }, create: { name, foodItemId }, update: { foodItemId } });
}
