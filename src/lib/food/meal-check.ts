// After a meal is planned: which of its ingredients HomeOS can't account for, so the person can
// decide per item — buy it (shopping list) or confirm they have it (recorded in the pantry).
import { prisma } from "../db";
import { checkRecipeAgainstPantry } from "./recipes";
import { pantryByFood } from "./pantry";
import { formatQuantity } from "../units";
import { isFreeStaple } from "./staples";
import { shoppingAmount } from "./shop-units";

export interface MealIngredientIssue {
  name: string;
  foodItemId: string | null;
  status: "unrecorded" | "out" | "short";
  need: number | null; // amount still missing
  unit: string;
  needText: string; // "300 g" / "as needed"
  haveText: string | null; // "100 g" when short
  buyText: string; // what the shopping list will say, e.g. "1 pack"
}

export interface MealCheck { mealId: string; title: string; haveCount: number; issues: MealIngredientIssue[] }

export async function checkMealIngredients(mealId: string): Promise<MealCheck | null> {
  const meal = await prisma.mealPlanItem.findUnique({ where: { id: mealId }, include: { servings: true } });
  if (!meal?.recipeId) return null;
  const total = meal.servings.reduce((a, s) => a + s.servings, 0);
  const stock = await pantryByFood();
  const check = await checkRecipeAgainstPantry(meal.recipeId, total > 0 ? total : undefined, stock);
  const foodIds = check.checks.map((c) => c.foodItemId).filter((x): x is string => Boolean(x));
  const everRecorded = new Set((await prisma.pantryItem.findMany({ where: { foodItemId: { in: foodIds } }, select: { foodItemId: true } })).map((p) => p.foodItemId));
  const foods = new Map((await prisma.foodItem.findMany({ where: { id: { in: foodIds } } })).map((f) => [f.id, f]));
  const issues: MealIngredientIssue[] = [];
  let haveCount = 0;
  for (const c of check.checks) {
    if (c.optional || isFreeStaple(c.name)) continue;
    if (c.status === "have") { haveCount++; continue; }
    const food = c.foodItemId ? foods.get(c.foodItemId) ?? null : null;
    const recorded = Boolean(c.foodItemId && everRecorded.has(c.foodItemId));
    const inStock = c.available > 0;
    const need = c.required === null ? null : c.missing;
    const shop = shoppingAmount(c.name, need, c.unit, food, inStock);
    if (shop.skip && c.status !== "unknown") { haveCount++; continue; } // e.g. a spice you have some of
    issues.push({
      name: c.name,
      foodItemId: c.foodItemId,
      status: !recorded ? "unrecorded" : inStock ? "short" : "out",
      need,
      unit: c.unit,
      needText: c.required === null ? "as needed" : formatQuantity(Math.round(c.required * 100) / 100, c.unit),
      haveText: inStock && c.required !== null ? formatQuantity(Math.round(c.available * 100) / 100, c.unit) : null,
      buyText: shop.skip ? "—" : formatQuantity(shop.quantity, shop.unit),
    });
  }
  return { mealId, title: meal.title, haveCount, issues };
}
