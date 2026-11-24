import { z } from "zod";
import { prisma } from "../db";
import { loadFoodIndex, ensureFoodItem } from "./catalog";
import { computeRecipeNutrition } from "./nutrition";
import { normalizeUnit, convert, formatQuantity } from "../units";
import { availabilityFrom, pantryByFood } from "./pantry";
import { audit } from "../audit";
import type { Viewer } from "../auth/session";

export const recipeIngredientInput = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().positive().nullable(),
  unit: z.string().max(30).default(""),
  note: z.string().max(200).default(""),
  optional: z.boolean().default(false),
  foodItemId: z.string().uuid().nullable().optional(),
});

export const recipeInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  cuisine: z.string().max(60).default(""),
  category: z.enum(["breakfast", "main", "side", "salad", "soup", "snack", "dessert", "drink", "sauce", "other"]).default("main"),
  servings: z.number().positive().max(100).default(2),
  prepMinutes: z.number().int().min(0).max(10000).nullable().default(null),
  cookMinutes: z.number().int().min(0).max(10000).nullable().default(null),
  temperature: z.string().max(40).default(""),
  instructions: z.string().max(20000).default(""),
  sourceType: z.string().max(20).default("MANUAL"),
  sourceUrl: z.string().max(1000).nullable().default(null),
  notes: z.string().max(10000).default(""),
  tags: z.string().max(300).default(""),
  favourite: z.boolean().default(false),
  ingredients: z.array(recipeIngredientInput).max(100),
});
export type RecipeInput = z.infer<typeof recipeInput>;

export async function saveRecipe(input: RecipeInput, viewer: Pick<Viewer, "profileId">, id?: string) {
  const data = recipeInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const index = await loadFoodIndex(tx);
    const ingredients = [] as { foodItemId: string; name: string; quantity: number | null; unit: string; note: string; optional: boolean; sortOrder: number }[];
    for (const [i, ing] of data.ingredients.entries()) {
      const unit = ing.quantity === null ? "" : normalizeUnit(ing.unit || "each");
      const food = ing.foodItemId ? await tx.foodItem.findUniqueOrThrow({ where: { id: ing.foodItemId } }) : await ensureFoodItem(ing.name, tx, index, { unit });
      ingredients.push({ foodItemId: food.id, name: ing.name, quantity: ing.quantity, unit, note: ing.note, optional: ing.optional, sortOrder: i });
    }
    const { ingredients: _ignored, ...fields } = data;
    void _ignored;
    const tags = fields.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).join(",");
    const recipe = id
      ? await tx.recipe.update({ where: { id }, data: { ...fields, tags, ingredients: { deleteMany: {}, create: ingredients } } })
      : await tx.recipe.create({ data: { ...fields, tags, createdByProfileId: viewer.profileId, ingredients: { create: ingredients } } });
    await audit({ profileId: viewer.profileId, action: id ? "recipe.update" : "recipe.create", entityType: "recipe", entityId: recipe.id, summary: recipe.name }, tx);
    return recipe;
  });
}

export const recipeInclude = {
  ingredients: { include: { foodItem: true }, orderBy: { sortOrder: "asc" as const } },
  images: { include: { file: true } },
};

export async function getRecipe(id: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id }, include: recipeInclude });
  if (!recipe) return null;
  return { ...recipe, nutrition: computeRecipeNutrition(recipe) };
}

export async function listRecipes(filter: { q?: string; tag?: string; favourite?: boolean; category?: string } = {}) {
  const recipes = await prisma.recipe.findMany({
    where: {
      ...(filter.q ? { OR: [{ name: { contains: filter.q } }, { cuisine: { contains: filter.q } }, { tags: { contains: filter.q.toLowerCase() } }, { ingredients: { some: { name: { contains: filter.q } } } }] } : {}),
      ...(filter.tag ? { tags: { contains: filter.tag } } : {}),
      ...(filter.favourite ? { favourite: true } : {}),
      ...(filter.category ? { category: filter.category } : {}),
    },
    include: recipeInclude,
    orderBy: [{ favourite: "desc" }, { updatedAt: "desc" }],
  });
  return recipes.map((r) => ({ ...r, nutrition: computeRecipeNutrition(r) }));
}

export type RecipeWithNutrition = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;

export interface IngredientCheck {
  name: string;
  foodItemId: string | null;
  required: number | null;
  unit: string;
  available: number;
  missing: number;
  status: "have" | "partial" | "missing" | "unknown";
  confidence: string;
  optional: boolean;
}

/** Compares a recipe (scaled to `servings`) against actual pantry records. */
export async function checkRecipeAgainstPantry(recipeId: string, servings?: number, pantry?: Awaited<ReturnType<typeof pantryByFood>>) {
  const recipe = await prisma.recipe.findUniqueOrThrow({ where: { id: recipeId }, include: recipeInclude });
  const stock = pantry ?? (await pantryByFood());
  const factor = servings ? servings / recipe.servings : 1;
  const checks: IngredientCheck[] = recipe.ingredients.map((ing) => {
    const items = (ing.foodItemId && stock.get(ing.foodItemId)) || [];
    if (ing.quantity === null) {
      return { name: ing.name, foodItemId: ing.foodItemId, required: null, unit: "", available: items.length ? 1 : 0, missing: 0, status: items.length ? "have" : "unknown", confidence: items[0]?.confidence ?? "—", optional: true };
    }
    const required = ing.quantity * factor;
    const avail = availabilityFrom(items, ing.foodItem ?? { gramsPerMl: null, gramsPerEach: null }, ing.unit);
    const missing = Math.max(0, required - avail.quantity);
    const status: IngredientCheck["status"] = missing <= 1e-9 ? "have" : avail.quantity > 0 ? "partial" : avail.unconvertible.length ? "unknown" : "missing";
    return { name: ing.name, foodItemId: ing.foodItemId, required, unit: ing.unit, available: avail.quantity, missing, status, confidence: avail.confidence, optional: ing.optional };
  });
  const essential = checks.filter((c) => !c.optional);
  const have = essential.filter((c) => c.status === "have").length;
  return { recipe, checks, coverage: essential.length ? have / essential.length : 1, canCook: essential.every((c) => c.status === "have") };
}

export function describeCheck(c: IngredientCheck) {
  if (c.required === null) return `${c.name} (as needed)`;
  return `${formatQuantity(c.missing, c.unit)} ${c.name}`;
}

export async function deleteRecipe(id: string, viewer: Pick<Viewer, "profileId">) {
  const r = await prisma.recipe.delete({ where: { id } });
  await audit({ profileId: viewer.profileId, action: "recipe.delete", entityType: "recipe", entityId: id, summary: r.name });
}

export { convert };
