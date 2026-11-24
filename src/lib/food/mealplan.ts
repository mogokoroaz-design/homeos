import { prisma, type Tx } from "../db";
import { addDays, startOfWeek } from "../dates";
import { computeRecipeNutrition, suggestServings } from "./nutrition";
import { recipeInclude } from "./recipes";
import { audit } from "../audit";
import type { Viewer } from "../auth/session";
import { currentTargets } from "./targets";
import { tokens } from "../utils";

export async function ensureMealPlan(date: string, tx: Tx = prisma) {
  const weekStart = startOfWeek(date);
  return tx.mealPlan.upsert({ where: { weekStart }, create: { weekStart }, update: {} });
}

export async function getMealItems(from: string, to: string) {
  const items = await prisma.mealPlanItem.findMany({
    where: { date: { gte: from, lte: to } },
    include: { recipe: { include: recipeInclude }, servings: { include: { profile: { select: { id: true, name: true, color: true } } } } },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });
  return items.map((it) => ({ ...it, nutrition: it.recipe ? computeRecipeNutrition(it.recipe) : null }));
}
export type MealItemFull = Awaited<ReturnType<typeof getMealItems>>[number];

export interface AddMealInput {
  date: string;
  slot: string;
  recipeId?: string | null;
  title?: string;
  notes?: string;
  cookTime?: string | null;
  prepNote?: string;
  servings?: Record<string, number>; // profileId → servings; omitted = suggested from targets
  leftoverServings?: number; // plan leftovers for next day lunch
}

/** Adds a meal; each household member's portion is computed from their own calorie target unless given. */
export async function addMeal(input: AddMealInput, viewer: Pick<Viewer, "profileId" | "householdId">, tx?: Tx) {
  const run = async (t: Tx) => {
    const plan = await ensureMealPlan(input.date, t);
    const recipe = input.recipeId ? await t.recipe.findUnique({ where: { id: input.recipeId }, include: recipeInclude }) : null;
    const title = recipe?.name ?? input.title?.trim();
    if (!title) throw new Error("Choose a recipe or enter a meal name");
    const item = await t.mealPlanItem.create({
      data: { mealPlanId: plan.id, date: input.date, slot: input.slot, recipeId: recipe?.id ?? null, title, notes: input.notes ?? "", cookTime: input.cookTime ?? null, prepNote: input.prepNote ?? "" },
    });
    const profiles = await t.householdProfile.findMany({ where: { householdId: viewer.householdId } });
    const perServing = recipe ? computeRecipeNutrition(recipe).perServing.kcal || null : null;
    for (const p of profiles) {
      const explicit = input.servings?.[p.id];
      const target = await currentTargets(p.id, input.date, t);
      const servings = explicit ?? suggestServings(target?.kcal ?? null, input.slot, perServing);
      if (servings > 0) await t.mealServing.create({ data: { mealPlanItemId: item.id, profileId: p.id, servings } });
    }
    if (input.leftoverServings && input.leftoverServings > 0) {
      const next = addDays(input.date, 1);
      const nextPlan = await ensureMealPlan(next, t);
      const left = await t.mealPlanItem.create({
        data: { mealPlanId: nextPlan.id, date: next, slot: "LUNCH", recipeId: recipe?.id ?? null, title: `${title} (leftovers)`, isLeftover: true, leftoverFromId: item.id },
      });
      // Leftover servings are split evenly between members by default.
      const each = Math.round((input.leftoverServings / Math.max(1, profiles.length)) * 4) / 4;
      for (const p of profiles) await t.mealServing.create({ data: { mealPlanItemId: left.id, profileId: p.id, servings: each } });
    }
    await audit({ profileId: viewer.profileId, action: "meal.add", entityType: "mealPlanItem", entityId: item.id, summary: `${title} on ${input.date} (${input.slot})` }, t);
    return item;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

export async function setServing(mealPlanItemId: string, profileId: string, servings: number) {
  if (servings <= 0) {
    await prisma.mealServing.deleteMany({ where: { mealPlanItemId, profileId } });
    return;
  }
  await prisma.mealServing.upsert({
    where: { mealPlanItemId_profileId: { mealPlanItemId, profileId } },
    create: { mealPlanItemId, profileId, servings },
    update: { servings },
  });
}

export async function updateMeal(id: string, data: { date?: string; slot?: string; recipeId?: string | null; title?: string; notes?: string; cookTime?: string | null; prepNote?: string; status?: string }) {
  let extra: { title?: string; mealPlanId?: string } = {};
  if (data.recipeId) {
    const r = await prisma.recipe.findUniqueOrThrow({ where: { id: data.recipeId } });
    extra.title = r.name;
  }
  if (data.date) extra = { ...extra, mealPlanId: (await ensureMealPlan(data.date)).id };
  return prisma.mealPlanItem.update({ where: { id }, data: { ...data, ...extra } });
}

export async function deleteMeal(id: string, viewer: Pick<Viewer, "profileId">) {
  const item = await prisma.mealPlanItem.delete({ where: { id } });
  await prisma.mealPlanItem.deleteMany({ where: { leftoverFromId: id } });
  await audit({ profileId: viewer.profileId, action: "meal.delete", entityType: "mealPlanItem", entityId: id, summary: item.title });
}

/** Copies the previous week's meals into the given week (portions recomputed). */
export async function copyWeek(fromWeekStart: string, toWeekStart: string, viewer: Pick<Viewer, "profileId" | "householdId">) {
  const items = await prisma.mealPlanItem.findMany({ where: { date: { gte: fromWeekStart, lte: addDays(fromWeekStart, 6) }, isLeftover: false }, include: { servings: true } });
  const offset = Math.round((Date.parse(toWeekStart) - Date.parse(fromWeekStart)) / 86400000);
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      await addMeal({ date: addDays(it.date, offset), slot: it.slot, recipeId: it.recipeId, title: it.title, notes: it.notes, cookTime: it.cookTime, prepNote: it.prepNote, servings: Object.fromEntries(it.servings.map((s) => [s.profileId, s.servings])) }, viewer, tx);
    }
  });
  return items.length;
}

/** Substitute suggestions: recipes in the same category sharing the most ingredients/cuisine. */
export async function suggestSubstitutes(mealPlanItemId: string, limit = 5) {
  const item = await prisma.mealPlanItem.findUniqueOrThrow({ where: { id: mealPlanItemId }, include: { recipe: { include: { ingredients: true } } } });
  const all = await prisma.recipe.findMany({ include: { ingredients: true } });
  const base = new Set((item.recipe?.ingredients ?? []).map((i) => i.foodItemId).filter(Boolean));
  const titleTokens = new Set(tokens(item.title));
  return all
    .filter((r) => r.id !== item.recipeId)
    .map((r) => {
      const shared = r.ingredients.filter((i) => i.foodItemId && base.has(i.foodItemId)).length;
      const score = shared * 2 + (item.recipe && r.category === item.recipe.category ? 2 : 0) + (item.recipe && r.cuisine && r.cuisine === item.recipe.cuisine ? 1 : 0) + tokens(r.name).filter((t) => titleTokens.has(t)).length + (r.favourite ? 0.5 : 0);
      return { recipe: r, score, shared };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Total servings to cook for a meal = sum of member portions + leftovers planned from it. */
export function servingsToCook(item: { id: string; isLeftover: boolean; servings: { servings: number }[] }, all: { leftoverFromId: string | null; servings: { servings: number }[] }[]) {
  if (item.isLeftover) return 0;
  const own = item.servings.reduce((a, s) => a + s.servings, 0);
  const leftovers = all.filter((x) => x.leftoverFromId === item.id).reduce((a, x) => a + x.servings.reduce((b, s) => b + s.servings, 0), 0);
  return own + leftovers;
}
