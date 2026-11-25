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

// Everyday names → the USDA entry a cook means (USDA wording differs, or the plain search picks a variant).
const KITCHEN_NAMES: Record<string, string> = {
  sugar: "sugars granulated", "white sugar": "sugars granulated", "caster sugar": "sugars granulated", "brown sugar": "sugars brown",
  chilli: "peppers hot chili red raw", chili: "peppers hot chili red raw", "red chilli": "peppers hot chili red raw", "green chilli": "peppers hot chili green raw", "green chili": "peppers hot chili green raw",
  "chilli flakes": "spices pepper red or cayenne", "chilli powder": "spices chili powder",
  "basmati rice": "rice white long-grain regular raw enriched", rice: "rice white long-grain regular raw enriched", "jasmine rice": "rice white long-grain regular raw enriched", "brown rice": "rice brown long-grain raw",
  ghee: "butter oil anhydrous", "thai basil": "basil fresh", "holy basil": "basil fresh",
  milk: "milk whole 3.25%", "whole milk": "milk whole 3.25%", "skim milk": "milk nonfat fluid", "semi skimmed milk": "milk reduced fat 2%",
  tomato: "tomatoes red ripe raw year round", "cherry tomato": "tomatoes red ripe raw year round", "chopped tomato": "tomatoes red ripe canned packed in tomato juice",
  "chicken thigh": "chicken broilers or fryers thigh meat only raw", "chicken breast": "chicken broilers or fryers breast meat only raw", chicken: "chicken broilers or fryers meat only raw",
  "minced chicken": "chicken ground raw", "ground chicken": "chicken ground raw", "minced beef": "beef ground 80% lean meat 20% fat raw", "ground beef": "beef ground 80% lean meat 20% fat raw",
  "yellow onion": "onions raw", "red onion": "onions raw", "white onion": "onions raw", shallot: "shallots raw",
  "all purpose flour": "wheat flour white all-purpose enriched bleached", flour: "wheat flour white all-purpose enriched bleached", "plain flour": "wheat flour white all-purpose enriched bleached",
  "spring onion": "onions spring or scallions", "green onion": "onions spring or scallions", scallion: "onions spring or scallions",
  "olive oil": "oil olive salad or cooking", "vegetable oil": "oil canola", oil: "oil canola", water: "water bottled generic",
  coriander: "coriander (cilantro) leaves raw", cilantro: "coriander (cilantro) leaves raw", potato: "potatoes flesh and skin raw", egg: "egg whole raw fresh",
  "greek yogurt": "yogurt greek plain whole milk", yogurt: "yogurt plain whole milk", curd: "yogurt plain whole milk", butter: "butter salted",
  "soy sauce": "soy sauce made from soy and wheat (shoyu)", "light soy sauce": "soy sauce made from soy and wheat (shoyu)", "dark soy sauce": "soy sauce made from soy and wheat (shoyu)",
  pasta: "pasta dry unenriched", spaghetti: "pasta dry unenriched", penne: "pasta dry unenriched", macaroni: "pasta dry unenriched", noodle: "noodles egg dry unenriched",
  cinnamon: "spices cinnamon ground", turmeric: "spices turmeric ground", "garam masala": "spices curry powder", "curry powder": "spices curry powder", paprika: "spices paprika",
  cream: "cream fluid heavy whipping", "heavy cream": "cream fluid heavy whipping", "sour cream": "cream sour cultured", bread: "bread white commercially prepared",
  mushroom: "mushrooms white raw", "bell pepper": "peppers sweet red raw", capsicum: "peppers sweet green raw", "peanut butter": "peanut butter smooth style without salt",
  "rice vinegar": "vinegar distilled", vinegar: "vinegar distilled", "lemon juice": "lemon juice raw", lime: "limes raw", lemon: "lemons raw without peel", pepper: "spices pepper black", "black pepper": "spices pepper black",
};
const MODIFIERS = new Set(["green", "orange", "yellow", "sauteed", "cooked", "fried", "roasted", "boiled", "baked", "skin", "giblet", "canned", "frozen", "dried", "dehydrated", "salted", "sweetened", "prepared", "stewed", "braised", "broiled", "grilled", "smoked", "pickled", "added", "solution", "souffle", "drained", "babyfood", "mozzarella", "ricotta", "buttermilk", "dry", "powder", "reduced", "low", "lite", "light", "free", "sodium", "spinach", "enoki", "imitation", "toasted"]);

/**
 * Picks the USDA entry for an everyday ingredient name, or null when nothing is a confident match
 * (an unlinked ingredient is better than wrong numbers). Deterministic; used for automatic linking.
 */
export function autoMatchReference(name: string): ReferenceFood | null {
  const key = normalizeName(name).split(" ").filter(Boolean).map(singular).join(" ");
  if (!key || key.split(" ").length > 4) return null;
  const query = KITCHEN_NAMES[key] ?? KITCHEN_NAMES[normalizeName(name)] ?? key;
  const q = normalizeName(query).split(" ").filter(Boolean).map(singular);
  const candidates = searchReference(query, 25);
  let best: { f: ReferenceFood; s: number } | null = null;
  for (const f of candidates) {
    const segs = f.name.split(",").map((x) => normalizeName(x).split(" ").filter(Boolean).map(singular));
    const all = segs.flat();
    let s = 100 - all.length * 2;
    s -= segs[0].filter((w) => !q.includes(w)).length * 15; // "sugar apple" for "sugar"
    s -= all.filter((w) => MODIFIERS.has(w) && !q.includes(w)).length * 12;
    if (all.includes("raw")) s += 10;
    if (segs[0].every((w) => q.includes(w))) s += 20;
    if (/[A-Z]{3,}/.test(f.name)) s -= 25; // branded rows
    if (!best || s > best.s) best = { f, s };
  }
  return best && best.s >= 60 ? best.f : null;
}
