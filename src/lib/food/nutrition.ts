// Deterministic nutrition calculations. Values come only from FoodItem per-100 g data
// (USDA SR28, product labels, or explicitly-marked user estimates). Nothing is invented.
import { toGrams } from "../units";
import { round } from "../utils";
import { ageFrom } from "../dates";

export interface Macros { kcal: number; protein: number; carbs: number; fat: number; fibre: number }
export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fibre: a.fibre + b.fibre };
}
export function scaleMacros(a: Macros, f: number): Macros {
  return { kcal: a.kcal * f, protein: a.protein * f, carbs: a.carbs * f, fat: a.fat * f, fibre: a.fibre * f };
}
export function roundMacros(a: Macros): Macros {
  return { kcal: Math.round(a.kcal), protein: round(a.protein, 1), carbs: round(a.carbs, 1), fat: round(a.fat, 1), fibre: round(a.fibre, 1) };
}

interface FoodNutrition {
  name: string;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fibrePer100g: number | null;
  gramsPerMl: number | null;
  gramsPerEach: number | null;
  nutritionSource: string | null;
  nutritionVerified: boolean;
}

export function macrosForGrams(food: FoodNutrition, grams: number): Macros | null {
  if (food.kcalPer100g === null || food.kcalPer100g === undefined) return null;
  const f = grams / 100;
  return {
    kcal: food.kcalPer100g * f,
    protein: (food.proteinPer100g ?? 0) * f,
    carbs: (food.carbsPer100g ?? 0) * f,
    fat: (food.fatPer100g ?? 0) * f,
    fibre: (food.fibrePer100g ?? 0) * f,
  };
}

export interface RecipeNutrition {
  total: Macros;
  perServing: Macros;
  coverage: number; // 0..1 share of quantified ingredients with nutrition
  verified: boolean; // every ingredient resolved from verified data
  missing: string[]; // ingredients that could not be included
  complete: boolean;
}

export function computeRecipeNutrition(
  recipe: { servings: number; ingredients: Array<{ name: string; quantity: number | null; unit: string; optional: boolean; foodItem: FoodNutrition | null }> },
): RecipeNutrition {
  let total = { ...ZERO };
  const missing: string[] = [];
  let counted = 0;
  let considered = 0;
  let allVerified = true;
  for (const ing of recipe.ingredients) {
    if (ing.quantity === null) {
      if (!ing.optional) missing.push(`${ing.name} (no quantity)`);
      continue;
    }
    considered++;
    const food = ing.foodItem;
    if (!food || food.kcalPer100g === null) { missing.push(`${ing.name} (no nutrition data)`); allVerified = false; continue; }
    const grams = toGrams(ing.quantity, ing.unit, food);
    if (grams === null) { missing.push(`${ing.name} (cannot convert ${ing.unit} to grams)`); allVerified = false; continue; }
    const m = macrosForGrams(food, grams)!;
    total = addMacros(total, m);
    counted++;
    if (!food.nutritionVerified) allVerified = false;
  }
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return {
    total: roundMacros(total),
    perServing: roundMacros(scaleMacros(total, 1 / servings)),
    coverage: considered ? counted / considered : 0,
    verified: allVerified && missing.length === 0 && counted > 0,
    missing,
    complete: missing.length === 0 && counted > 0,
  };
}

// ── Targets ──
// Mifflin–St Jeor BMR (Mifflin et al., 1990). Activity multipliers are the standard
// FAO/WHO-derived factors. Goal adjustments (−500 / +300 kcal) and the macro split
// (protein 25 %, carbs 45 %, fat 30 % of energy; fibre 14 g per 1000 kcal per the
// Dietary Guidelines for Americans) are documented defaults the user can override.
export const ACTIVITY_FACTORS: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
export const GOAL_ADJUST: Record<string, number> = { lose: -500, maintain: 0, gain: 300 };

export function estimateTargets(p: { weightKg: number | null; heightCm: number | null; birthDate: string | null; sex: string | null; activityLevel: string; goal: string }) {
  const age = ageFrom(p.birthDate);
  if (!p.weightKg || !p.heightCm || age === null) return { ok: false as const, reason: "Weight, height and birth date are required to estimate targets." };
  const sexAdj = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age + sexAdj;
  const tdee = bmr * (ACTIVITY_FACTORS[p.activityLevel] ?? 1.55);
  const kcal = Math.max(1200, Math.round((tdee + (GOAL_ADJUST[p.goal] ?? 0)) / 10) * 10);
  return {
    ok: true as const,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    protein: Math.round((kcal * 0.25) / 4),
    carbs: Math.round((kcal * 0.45) / 4),
    fat: Math.round((kcal * 0.3) / 9),
    fibre: Math.round((kcal / 1000) * 14),
  };
}

// Share of daily energy assumed per meal slot when suggesting portions (documented default).
export const SLOT_SHARE: Record<string, number> = { BREAKFAST: 0.25, LUNCH: 0.3, DINNER: 0.35, SNACK: 0.1 };

/** Suggested servings for a person: their slot energy budget ÷ kcal per serving, rounded to ¼, clamped 0.5–4. */
export function suggestServings(targetKcal: number | null, slot: string, kcalPerServing: number | null) {
  if (!targetKcal || !kcalPerServing || kcalPerServing <= 0) return 1;
  const raw = (targetKcal * (SLOT_SHARE[slot] ?? 0.3)) / kcalPerServing;
  return Math.min(4, Math.max(0.5, Math.round(raw * 4) / 4));
}
