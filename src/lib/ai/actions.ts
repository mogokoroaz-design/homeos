// Approval-gated actions: Recommend → Preview → Approve → Execute → Record.
// Assistants may only *propose* actions. Execution happens through these validated executors,
// never through free-form database access or AI-generated code.
import { z } from "zod";
import { prisma } from "../db";
import type { Viewer } from "../auth/session";
import { applyInventoryChanges, consumeFood } from "../food/pantry";
import { addMeal } from "../food/mealplan";
import { syncMealPlanGroceries, addGroceryItem } from "../food/grocery";
import { saveRecipe, recipeInput } from "../food/recipes";
import { createProjectFromDef } from "../projects/projects";
import { projectDef } from "../projects/schema";
import { audit } from "../audit";
import { today } from "../dates";

const inventoryChange = z.object({
  action: z.enum(["ADD", "CONSUME", "WASTE", "SET"]),
  name: z.string().min(1),
  foodItemId: z.string().nullable().optional(),
  quantity: z.number().positive().nullable(),
  unit: z.string(),
  location: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  confidence: z.enum(["CONFIRMED", "ESTIMATED", "UNVERIFIED"]).optional(),
});

export const ACTION_SCHEMAS = {
  PANTRY_UPDATE: z.object({ changes: z.array(inventoryChange).min(1).max(50) }),
  MEAL_PLAN: z.object({ meals: z.array(z.object({ date: z.string(), slot: z.string(), recipeId: z.string() })).min(1).max(60), servings: z.number().positive().nullable().optional() }),
  GROCERY_ADD: z.object({ items: z.array(z.object({ name: z.string().min(1), quantity: z.number().positive(), unit: z.string() })).min(1).max(50) }),
  MEAL_COOKED: z.object({ mealPlanItemId: z.string(), deductions: z.array(z.object({ foodItemId: z.string(), name: z.string(), quantity: z.number().positive(), unit: z.string() })) }),
  NUTRITION_TARGETS: z.object({ profileId: z.string(), kcal: z.number().positive(), protein: z.number().min(0), carbs: z.number().min(0), fat: z.number().min(0), fibre: z.number().min(0), method: z.string() }),
  RECIPE_SAVE: z.object({ recipe: recipeInput }),
  PROJECT_CREATE: z.object({ def: projectDef }),
} as const;
export type ActionKind = keyof typeof ACTION_SCHEMAS;

export async function proposeAction<K extends ActionKind>(viewer: Pick<Viewer, "profileId">, kind: K, summary: string, payload: z.input<(typeof ACTION_SCHEMAS)[K]>, conversationId?: string | null) {
  const parsed = ACTION_SCHEMAS[kind].parse(payload);
  return prisma.aIAction.create({ data: { profileId: viewer.profileId, kind, summary, payload: JSON.stringify(parsed), conversationId: conversationId ?? null } });
}

export async function rejectAction(viewer: Pick<Viewer, "profileId">, id: string) {
  const a = await prisma.aIAction.findUnique({ where: { id } });
  if (!a || a.profileId !== viewer.profileId) throw new Error("Action not found");
  if (a.status !== "PROPOSED") throw new Error("Action already decided");
  await prisma.aIAction.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date() } });
}

export async function executeAction(viewer: Pick<Viewer, "profileId" | "householdId">, id: string, overridePayload?: unknown) {
  const a = await prisma.aIAction.findUnique({ where: { id } });
  if (!a || a.profileId !== viewer.profileId) throw new Error("Action not found");
  if (a.status !== "PROPOSED") throw new Error("This action has already been decided");
  const kind = a.kind as ActionKind;
  const schema = ACTION_SCHEMAS[kind];
  if (!schema) throw new Error("Unknown action");
  // The user may edit the preview before approving; edits are re-validated.
  const payload = schema.parse(overridePayload ?? JSON.parse(a.payload)) as never;
  let result: unknown;
  try {
    result = await EXECUTORS[kind](viewer, payload);
    await prisma.aIAction.update({ where: { id }, data: { status: "EXECUTED", decidedAt: new Date(), result: JSON.stringify(result ?? null), payload: JSON.stringify(payload) } });
    await audit({ profileId: viewer.profileId, action: `ai.execute.${kind.toLowerCase()}`, entityType: "aiAction", entityId: id, summary: a.summary });
    return result;
  } catch (e) {
    await prisma.aIAction.update({ where: { id }, data: { status: "FAILED", decidedAt: new Date(), result: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) } });
    throw e;
  }
}

type Exec<K extends ActionKind> = (viewer: Pick<Viewer, "profileId" | "householdId">, p: z.infer<(typeof ACTION_SCHEMAS)[K]>) => Promise<unknown>;

const EXECUTORS: { [K in ActionKind]: Exec<K> } = {
  PANTRY_UPDATE: async (v, p) => applyInventoryChanges(p.changes, v.profileId, { type: "assistant", id: "chat" }),
  MEAL_PLAN: async (v, p) => {
    await prisma.$transaction(async (tx) => {
      for (const m of p.meals) await addMeal({ date: m.date, slot: m.slot, recipeId: m.recipeId }, v, tx);
    });
    const dates = p.meals.map((m) => m.date).sort();
    await syncMealPlanGroceries({ from: dates[0] < today() ? today() : dates[0], to: dates[dates.length - 1] });
    return { added: p.meals.length };
  },
  GROCERY_ADD: async (_v, p) => {
    const out = [];
    for (const it of p.items) out.push((await addGroceryItem({ ...it, source: "ASSISTANT" })).merged ? `${it.name} (merged)` : it.name);
    return out;
  },
  MEAL_COOKED: async (v, p) => {
    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const d of p.deductions) results.push({ name: d.name, ...(await consumeFood({ foodItemId: d.foodItemId, quantity: d.quantity, unit: d.unit, reason: "MEAL", refType: "mealPlanItem", refId: p.mealPlanItemId, profileId: v.profileId }, tx)) });
      await tx.mealPlanItem.update({ where: { id: p.mealPlanItemId }, data: { status: "COOKED" } });
      return results;
    });
  },
  NUTRITION_TARGETS: async (v, p) => {
    if (p.profileId !== v.profileId) throw new Error("You can only change your own targets");
    return prisma.nutritionTarget.create({ data: { profileId: p.profileId, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fibre: p.fibre, method: p.method, effectiveFrom: today() } });
  },
  RECIPE_SAVE: async (v, p) => saveRecipe(p.recipe, v),
  PROJECT_CREATE: async (v, p) => createProjectFromDef(v, p.def),
};
