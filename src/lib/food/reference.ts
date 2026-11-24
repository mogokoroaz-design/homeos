import fs from "node:fs";
import path from "node:path";
import { normalizeName, singular } from "../utils";

export interface ReferenceFood {
  ndb: string;
  name: string;
  group: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fibre: number | null;
  sugar: number | null;
  sodiumMg: number | null;
  gramsPerMl: number | null;
  gramsPerEach: number | null;
  portions: { grams: number; label: string }[];
}

let cache: { source: string; foods: ReferenceFood[]; index: string[][] } | null = null;

export function loadReference() {
  if (!cache) {
    const file = path.join(process.cwd(), "reference", "usda-sr28.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { source: string; foods: ReferenceFood[] };
    cache = { ...data, index: data.foods.map((f) => normalizeName(f.name).split(" ").map(singular)) };
  }
  return cache;
}

export const REFERENCE_SOURCE_LABEL = "USDA SR28";

export function getReferenceFood(ndb: string) {
  return loadReference().foods.find((f) => f.ndb === ndb) ?? null;
}

/** Ranked text search over the USDA reference. Deterministic. */
export function searchReference(query: string, limit = 12): ReferenceFood[] {
  const q = normalizeName(query).split(" ").filter(Boolean).map(singular);
  if (!q.length) return [];
  const { foods, index } = loadReference();
  const scored: { f: ReferenceFood; s: number }[] = [];
  for (let i = 0; i < foods.length; i++) {
    const words = index[i];
    let matched = 0;
    for (const t of q) if (words.some((w) => w === t || (t.length > 3 && w.startsWith(t)))) matched++;
    if (matched < q.length) continue;
    let s = 100;
    if (words[0] === q[0]) s += 30;
    if (words.includes("raw")) s += 12;
    if (/fresh|whole/.test(foods[i].name.toLowerCase())) s += 4;
    if (/(babyfood|fast food|restaurant|infant|formula)/i.test(foods[i].name)) s -= 40;
    s -= words.length * 2;
    scored.push({ f: foods[i], s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

const GROUP_TO_CATEGORY: Record<string, string> = {
  dairy_egg: "dairy", spice: "spice", fat_oil: "oil", poultry: "meat", meat: "meat", seafood: "seafood",
  vegetable: "vegetable", fruit: "fruit", legume: "legume", grain: "grain", cereal: "grain", baked: "bakery",
  nut_seed: "nut", beverage: "beverage", sweet: "sweet", soup_sauce: "sauce", snack: "snack",
};
export function categoryForGroup(group: string) {
  return GROUP_TO_CATEGORY[group] ?? "other";
}
