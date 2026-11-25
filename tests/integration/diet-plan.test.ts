import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { saveRecipe, recipeInput } from "@/lib/food/recipes";
import { proposeMealPlan, parsePlanRequest } from "@/lib/food/planner";
import { adaptRecipe } from "@/lib/food/variants";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer, sam: Viewer;
const recipe = (name: string, ings: string[], category = "main") => recipeInput.parse({ name, category, servings: 2, ingredients: ings.map((n) => ({ name: n, quantity: 100, unit: "g" })) });

beforeAll(async () => {
  ({ alex, sam } = await seedHousehold());
  await saveRecipe(recipe("Chicken curry", ["chicken thighs", "coconut milk", "rice"]), alex);
  await saveRecipe(recipe("Prawn noodles", ["prawns", "rice noodles"]), alex);
  await saveRecipe(recipe("Chickpea stew", ["chickpeas", "tomatoes", "spinach"]), alex);
  await saveRecipe(recipe("Mushroom risotto", ["arborio rice", "mushrooms", "parmesan"]), alex);
});

describe("diet-aware meal planning", () => {
  it("respects every member's diet for shared meals and explains what it skipped", async () => {
    await prisma.householdProfile.update({ where: { id: sam.profileId }, data: { dietPreferences: "vegetarian" } });
    await prisma.householdProfile.update({ where: { id: alex.profileId }, data: { dietPreferences: "avoid mushrooms" } });
    const p = await proposeMealPlan({ ...parsePlanRequest("plan 4 dinners"), startDate: "2027-01-04" });
    expect([...new Set(p.meals.map((m) => m.title))]).toEqual(["Chickpea stew"]);
    const w = p.warnings.join(" ");
    expect(w).toMatch(/Sam — Vegetarian/);
    expect(w).toMatch(/Alex — No mushroom/);
    expect(w).toMatch(/Chicken curry \(Sam: vegetarian — chicken thighs\)/);
    expect(w).toMatch(/Mushroom risotto \(Alex: no mushroom — mushrooms\)/);
  });
  it("can be told to ignore diets, and understands diet words in the request", async () => {
    const ig = await proposeMealPlan({ ...parsePlanRequest("plan 4 dinners, ignore diets"), startDate: "2027-01-04" });
    expect(new Set(ig.meals.map((m) => m.title)).size).toBe(4);
    await prisma.householdProfile.updateMany({ data: { dietPreferences: "" } });
    const veg = await proposeMealPlan({ ...parsePlanRequest("plan 3 vegetarian dinners"), startDate: "2027-01-04" });
    expect(new Set(veg.meals.map((m) => m.title))).toEqual(new Set(["Chickpea stew", "Mushroom risotto"]));
    expect(veg.warnings.join(" ")).toMatch(/requested — Vegetarian/);
  });
});

describe("variants and collections", () => {
  it("saves an adapted copy linked to the original, leaving the original unchanged", async () => {
    const orig = await prisma.recipe.findFirstOrThrow({ where: { name: "Chicken curry" }, include: { ingredients: true } });
    const r = adaptRecipe({ name: orig.name, instructions: "Brown the chicken thighs.", notes: "", tags: "", ingredients: orig.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional })) }, "make it vegetarian");
    const v = await saveRecipe(recipeInput.parse({ ...r.draft, servings: 2, sourceType: "VARIANT", variantOfId: orig.id }), alex);
    const saved = await prisma.recipe.findUniqueOrThrow({ where: { id: v.id }, include: { ingredients: { orderBy: { sortOrder: "asc" } }, variantOf: true } });
    expect(saved.variantOf?.name).toBe("Chicken curry");
    expect(saved.ingredients[0].name).toBe("extra-firm tofu");
    expect(saved.instructions).toBe("Brown the extra-firm tofu.");
    expect((await prisma.recipe.findUniqueOrThrow({ where: { id: orig.id }, include: { ingredients: true } })).ingredients.map((i) => i.name)).toContain("chicken thighs");
    expect(await prisma.recipe.count({ where: { variantOfId: orig.id } })).toBe(1);
  });
  it("recipes can live in several collections; deleting a collection keeps recipes", async () => {
    const [a, b] = await Promise.all([prisma.recipeCollection.create({ data: { name: "Weeknight" } }), prisma.recipeCollection.create({ data: { name: "Freezer friendly" } })]);
    const stew = await prisma.recipe.findFirstOrThrow({ where: { name: "Chickpea stew" } });
    await prisma.recipeCollectionItem.createMany({ data: [{ collectionId: a.id, recipeId: stew.id }, { collectionId: b.id, recipeId: stew.id }] });
    const { listRecipes } = await import("@/lib/food/recipes");
    expect((await listRecipes({ collectionId: a.id })).map((r) => r.name)).toEqual(["Chickpea stew"]);
    await prisma.recipeCollection.delete({ where: { id: a.id } });
    expect(await prisma.recipe.count({ where: { id: stew.id } })).toBe(1);
    expect(await prisma.recipeCollectionItem.count()).toBe(1);
  });
});
