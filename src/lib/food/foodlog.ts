import { prisma } from "../db";
import { assertCanViewPersonal } from "../auth/access";
import type { Viewer } from "../auth/session";
import { computeRecipeNutrition, macrosForGrams, roundMacros, scaleMacros, ZERO, addMacros, type Macros } from "./nutrition";
import { toGrams } from "../units";
import { recipeInclude } from "./recipes";
import { currentTargets } from "./targets";
import { addDays, dateRange } from "../dates";

type V = Pick<Viewer, "profileId">;

async function ensureLog(profileId: string, date: string) {
  return prisma.foodLog.upsert({ where: { profileId_date: { profileId, date } }, create: { profileId, date }, update: {} });
}

/** Logs the viewer's own planned portion of a meal, with nutrition from the recipe. */
export async function logPlannedMeal(viewer: V, mealPlanItemId: string, servingsOverride?: number) {
  const item = await prisma.mealPlanItem.findUniqueOrThrow({ where: { id: mealPlanItemId }, include: { recipe: { include: recipeInclude }, servings: true } });
  const serving = item.servings.find((s) => s.profileId === viewer.profileId);
  const servings = servingsOverride ?? serving?.servings ?? 1;
  const log = await ensureLog(viewer.profileId, item.date);
  let macros: Macros = { ...ZERO };
  let isEstimate = true;
  if (item.recipe) {
    const n = computeRecipeNutrition(item.recipe);
    macros = scaleMacros(n.perServing, servings);
    isEstimate = !n.verified;
  }
  const m = roundMacros(macros);
  await prisma.foodLogItem.create({
    data: { foodLogId: log.id, slot: item.slot, description: `${item.title} × ${servings}`, mealPlanItemId: item.id, recipeId: item.recipeId, quantity: servings, unit: "serving", ...m, isEstimate, source: "RECIPE" },
  });
  if (serving) await prisma.mealServing.update({ where: { id: serving.id }, data: { logged: true } });
}

/** Logs an amount of a catalogued food; nutrition only when the food has reference/label data. */
export async function logFood(viewer: V, input: { date: string; slot: string; foodItemId: string; quantity: number; unit: string }) {
  const food = await prisma.foodItem.findUniqueOrThrow({ where: { id: input.foodItemId } });
  const grams = toGrams(input.quantity, input.unit, food);
  if (grams === null) throw new Error(`Cannot convert ${input.unit} of ${food.name} to grams — use g/kg or add a per-item weight to the food.`);
  const macros = macrosForGrams(food, grams);
  if (!macros) throw new Error(`${food.name} has no nutrition data yet. Link it to the USDA reference or enter label values first.`);
  const log = await ensureLog(viewer.profileId, input.date);
  return prisma.foodLogItem.create({
    data: { foodLogId: log.id, slot: input.slot, description: `${input.quantity} ${input.unit} ${food.name}`, foodItemId: food.id, quantity: input.quantity, unit: input.unit, grams, ...roundMacros(macros), isEstimate: !food.nutritionVerified, source: food.nutritionSource === "LABEL" ? "LABEL" : "REFERENCE" },
  });
}

/** Manual entry: user-provided values, flagged as an estimate unless taken from a label. */
export async function logManual(viewer: V, input: { date: string; slot: string; description: string; kcal: number; protein?: number; carbs?: number; fat?: number; fibre?: number; fromLabel: boolean }) {
  const log = await ensureLog(viewer.profileId, input.date);
  return prisma.foodLogItem.create({
    data: { foodLogId: log.id, slot: input.slot, description: input.description, kcal: input.kcal, protein: input.protein ?? 0, carbs: input.carbs ?? 0, fat: input.fat ?? 0, fibre: input.fibre ?? 0, isEstimate: !input.fromLabel, source: input.fromLabel ? "LABEL" : "MANUAL" },
  });
}

export async function deleteLogItem(viewer: V, id: string) {
  const item = await prisma.foodLogItem.findUnique({ where: { id }, include: { foodLog: true } });
  if (!item || item.foodLog.profileId !== viewer.profileId) throw new Error("Not found");
  await prisma.foodLogItem.delete({ where: { id } });
  if (item.mealPlanItemId) await prisma.mealServing.updateMany({ where: { mealPlanItemId: item.mealPlanItemId, profileId: viewer.profileId }, data: { logged: false } });
}

export async function dayLog(viewer: V, ownerId: string, date: string) {
  await assertCanViewPersonal(viewer, ownerId, "nutrition");
  const log = await prisma.foodLog.findUnique({ where: { profileId_date: { profileId: ownerId, date } }, include: { items: { orderBy: { createdAt: "asc" } } } });
  const items = log?.items ?? [];
  const totals = roundMacros(items.reduce((a, i) => addMacros(a, i), { ...ZERO }));
  const target = await currentTargets(ownerId, date);
  return { items, totals, target, hasEstimates: items.some((i) => i.isEstimate) };
}

export async function nutritionTrend(viewer: V, ownerId: string, endDate: string, days = 14) {
  await assertCanViewPersonal(viewer, ownerId, "nutrition");
  const from = addDays(endDate, -(days - 1));
  const logs = await prisma.foodLog.findMany({ where: { profileId: ownerId, date: { gte: from, lte: endDate } }, include: { items: true } });
  const target = await currentTargets(ownerId, endDate);
  return dateRange(from, endDate).map((d) => {
    const items = logs.find((l) => l.date === d)?.items ?? [];
    const t = roundMacros(items.reduce((a, i) => addMacros(a, i), { ...ZERO }));
    return { date: d, logged: items.length > 0, ...t, target: target?.kcal ?? null };
  });
}
