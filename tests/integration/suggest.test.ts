import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { saveRecipe, recipeInput } from "@/lib/food/recipes";
import { applyInventoryChanges } from "@/lib/food/pantry";
import { ensureFoodItem } from "@/lib/food/catalog";
import { kitchenSuggestions, recentAdditions } from "@/lib/food/suggest";
import { today, addDays } from "@/lib/dates";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer;
beforeAll(async () => {
  ({ alex } = await seedHousehold());
  const r = (name: string, ings: [number, string, string][], extra: Record<string, unknown> = {}) => saveRecipe(recipeInput.parse({ name, servings: 2, ingredients: ings.map(([quantity, unit, n]) => ({ name: n, quantity, unit })), ...extra }), alex);
  await r("Flour tortillas", [[300, "g", "all purpose flour"], [120, "ml", "water"], [30, "ml", "olive oil"]]);
  await r("Chicken & rice bowl", [[400, "g", "chicken breast"], [200, "g", "basmati rice"], [100, "g", "spinach"]]);
  await r("Pork dumplings", [[200, "g", "all purpose flour"], [300, "g", "minced pork"]]);
  await prisma.householdProfile.update({ where: { id: alex.profileId }, data: { dietPreferences: "no pork" } });
  await applyInventoryChanges([
    { action: "ADD", name: "all purpose flour", quantity: 1000, unit: "g" }, { action: "ADD", name: "water", quantity: 2000, unit: "ml" }, { action: "ADD", name: "olive oil", quantity: 500, unit: "ml" },
    { action: "ADD", name: "milk", quantity: 1000, unit: "ml" }, { action: "ADD", name: "egg", quantity: 6, unit: "each" },
    { action: "ADD", name: "chicken breast", quantity: 800, unit: "g" }, { action: "ADD", name: "basmati rice", quantity: 1000, unit: "g" }, { action: "ADD", name: "spinach", quantity: 200, unit: "g" },
  ], alex.profileId);
  await prisma.nutritionTarget.create({ data: { profileId: alex.profileId, kcal: 2000, protein: 140, carbs: 220, fat: 65, fibre: 28, effectiveFrom: addDays(today(), -5) } });
});

describe("proactive kitchen assistant", () => {
  it("new ingredients get USDA nutrition automatically", async () => {
    const f = await ensureFoodItem("hoisin sauce");
    expect(f).toMatchObject({ nutritionSource: "USDA_SR28", nutritionVerified: false });
    expect(f.kcalPer100g).toBeGreaterThan(100);
  });

  it("suggests saved recipes and new ideas for flour, respecting diet", async () => {
    const s = await kitchenSuggestions(alex, ["All purpose flour"], new Date("2026-11-25T18:30:00"));
    expect(s.useIt.map((r) => r.name)).toEqual(["Flour tortillas"]); // pork dumplings filtered by "no pork"
    expect(s.useIt[0].coverage).toBe(1);
    const pancakes = s.ideas.find((i) => i.title === "Pancakes");
    expect(pancakes).toBeDefined();
    expect(pancakes!.have).toEqual(expect.arrayContaining(["milk", "egg"]));
    expect(pancakes!.need).toEqual(expect.arrayContaining(["sugar", "butter"]));
  });

  it("suggests what to eat next from targets and today's log", async () => {
    const s = await kitchenSuggestions(alex, [], new Date("2026-11-25T18:30:00"));
    expect(s.next.remaining).toEqual({ kcal: 2000, protein: 140 });
    expect(s.next.picks[0]).toMatchObject({ name: "Chicken & rice bowl", canCook: true });
    expect(s.next.picks[0].reason).toMatch(/protein/);
  });

  it("knows what was added recently", async () => {
    expect(await recentAdditions()).toEqual(expect.arrayContaining(["All Purpose Flour", "Chicken Breast"]));
  });
});

import { handleMessage } from "@/lib/ai/assistant";
import { executeAction } from "@/lib/ai/actions";
describe("assistant: add to a meal", () => {
  it("'add 1 cup plain boiled rice to my lunch today' → meal plan for me (+ log), not the pantry", async () => {
    const before = await prisma.pantryItem.count();
    const res = await handleMessage(alex, { text: "add 1 cup plain boiled rice to my lunch today", surface: "KITCHEN" });
    const card = (res as unknown as { message: { cards: { type: string; actionId: string; kind: string; preview: { logEaten: boolean } }[] } }).message.cards.find((c) => c.type === "action")!;
    expect(card.kind).toBe("MEAL_ADD");
    await executeAction(alex, card.actionId, { ...card.preview, logEaten: true });
    const meal = await prisma.mealPlanItem.findFirstOrThrow({ where: { date: today(), slot: "LUNCH", title: { contains: "Boiled rice" } }, include: { servings: true } });
    expect(meal.servings.map((s) => s.profileId)).toEqual([alex.profileId]); // "my" lunch → only Alex
    const log = await prisma.foodLogItem.findFirstOrThrow({ where: { foodLog: { profileId: alex.profileId, date: today() }, slot: "LUNCH" } });
    expect(log.kcal).toBeGreaterThan(150); // ~1 cup cooked white rice ≈ 200 kcal
    expect(log.kcal).toBeLessThan(260);
    expect(await prisma.pantryItem.count()).toBe(before);
  });
});
