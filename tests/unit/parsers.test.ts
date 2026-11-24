import { describe, it, expect } from "vitest";
import { parseIngredientLine, parseRecipeText, parseInventoryText } from "@/lib/food/parse";
import { parseReceiptText, redactCardNumbers } from "@/lib/finance/receipt-parser";
import { extractJsonLdRecipe } from "@/lib/food/importer";
import { evaluateFormula, validateFormula } from "@/lib/projects/formula";
import { buildProjectProposal } from "@/lib/projects/builder";
import { validateEntry, projectDef } from "@/lib/projects/schema";
import { parsePlanRequest } from "@/lib/food/planner";
import { computeRecipeNutrition, estimateTargets, suggestServings } from "@/lib/food/nutrition";
import { ageFrom } from "@/lib/dates";

describe("ingredient parsing", () => {
  it.each([
    ["500 g chicken thighs, boneless", 500, "g", "chicken thighs"],
    ["2 cups (250g) flour", 2, "cup", "flour"],
    ["1 (14 oz) can diced tomatoes", 14, "oz", "tomatoes"],
    ["3 large eggs", 3, "each", "eggs"],
    ["1½ cups milk", 1.5, "cup", "milk"],
    ["4 cloves garlic, minced", 4, "clove", "garlic"],
    ["500g mushrooms", 500, "g", "mushrooms"],
  ])("%s", (line, q, u, n) => {
    const p = parseIngredientLine(line);
    expect(p.quantity).toBe(q);
    expect(p.unit).toBe(u);
    expect(p.name).toBe(n);
  });
  it("marks to-taste lines optional without a quantity", () => {
    const p = parseIngredientLine("salt and pepper to taste");
    expect(p.quantity).toBeNull();
    expect(p.optional).toBe(true);
  });
});

describe("recipe text", () => {
  it("extracts sections, servings, times and temperature", () => {
    const r = parseRecipeText("Garlic Butter Chicken\nServes 4\nPrep 10 min, Cook 25 mins at 400F\nIngredients\n- 500 g chicken thighs\n- 3 tbsp butter\nInstructions\n1. Season.\n2. Bake 20 minutes.");
    expect(r.name).toBe("Garlic Butter Chicken");
    expect(r.servings).toBe(4);
    expect(r.prepMinutes).toBe(10);
    expect(r.cookMinutes).toBe(25);
    expect(r.temperature).toBe("400°F");
    expect(r.ingredients).toHaveLength(2);
    expect(r.instructions).toEqual(["Season.", "Bake 20 minutes."]);
  });
  it("reads schema.org JSON-LD", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"Lentil Soup","recipeYield":"6 servings","prepTime":"PT15M","cookTime":"PT1H","recipeIngredient":["1 cup red lentils","2 carrots"],"recipeInstructions":[{"@type":"HowToStep","text":"Rinse lentils."},{"@type":"HowToStep","text":"Simmer."}]}]}</script>`;
    const d = extractJsonLdRecipe(html, "https://example.com/soup")!;
    expect(d.name).toBe("Lentil Soup");
    expect(d.servings).toBe(6);
    expect(d.cookMinutes).toBe(60);
    expect(d.ingredients[0]).toMatchObject({ quantity: 1, unit: "cup", name: "red lentils" });
    expect(d.instructions).toBe("Rinse lentils.\nSimmer.");
  });
});

describe("conversational inventory", () => {
  it("parses purchases with locations", () => {
    const c = parseInventoryText("We bought 2kg rice, 6 eggs and half a litre of milk for the fridge");
    expect(c.map((x) => [x.action, x.quantity, x.unit, x.name])).toEqual([["ADD", 2, "kg", "rice"], ["ADD", 6, "each", "eggs"], ["ADD", 0.5, "l", "milk"]]);
    expect(c[0].location).toBe("FRIDGE");
  });
  it("parses consumption and waste", () => {
    expect(parseInventoryText("used 200 g spinach")[0]).toMatchObject({ action: "CONSUME", quantity: 200, unit: "g", name: "spinach" });
    expect(parseInventoryText("threw out the milk")[0]).toMatchObject({ action: "WASTE", quantity: null });
  });
});

describe("receipt parsing", () => {
  const text = `FRESH MARKET\n123 Main St\n11/20/2026 14:32\nBANANAS 1.25 lb @ 0.69/lb 0.86\nMILK 2% 1GAL 3.99\n2 x GREEK YOGURT 5.98\nEGGS LARGE DZ 4.49\nSUBTOTAL 15.32\nTAX 0.42\nTOTAL 15.74\nVISA ************4242\nTHANK YOU`;
  const r = parseReceiptText(text);
  it("extracts header and totals", () => {
    expect(r.merchant).toBe("FRESH MARKET");
    expect(r.date).toBe("2026-11-20");
    expect(r.subtotalCents).toBe(1532);
    expect(r.taxCents).toBe(42);
    expect(r.totalCents).toBe(1574);
    expect(r.categoryKey).toBe("groceries");
  });
  it("extracts items with quantities and weights", () => {
    expect(r.items.map((i) => [i.name, i.quantity, i.unit, i.totalCents])).toEqual([["BANANAS", 1.25, "lb", 86], ["MILK 2% 1GAL", 1, "each", 399], ["GREEK YOGURT", 2, "each", 598], ["EGGS LARGE DZ", 1, "each", 449]]);
    expect(r.warnings.filter((w) => w.includes("add up"))).toEqual([]);
  });
  it("categorises by merchant before item words", () => {
    expect(parseReceiptText("CORNER MARKET\n11/21/2026\nCOFFEE BEANS 11.49\nTOTAL 11.49").categoryKey).toBe("groceries");
    expect(parseReceiptText("Luigi's\n11/21/2026\nPIZZA 18.00\nTOTAL 18.00").categoryKey).toBe("restaurants");
  });
  it("never keeps full card numbers", () => {
    expect(r.paymentNote).toBe("Visa ending 4242");
    expect(redactCardNumbers("card 4111 1111 1111 1234 ok")).toBe("card •••• 1234 ok");
    expect(r.redactedText).not.toMatch(/\d{9,}/);
  });
});

describe("projects", () => {
  it("evaluates formulas safely", () => {
    expect(evaluateFormula("round(pages / minutes * 60, 1)", { pages: 30, minutes: 45 })).toBe(40);
    expect(evaluateFormula("a + b", { a: 1, b: null })).toBeNull();
    expect(validateFormula("process.exit()", [])).toBeTruthy();
    expect(validateFormula("constructor", [])).toMatch(/Unknown field/);
    expect(() => evaluateFormula("1 +", {})).toThrow();
  });
  it("builds the daily journal from natural language", () => {
    const { proposal } = buildProjectProposal("I want to create a daily journal where I can record my mood, what happened during the day, what I learned, what I am grateful for and how I felt.");
    expect(proposal.name).toBe("Daily Journal");
    expect(proposal.fields.map((f) => [f.label, f.type])).toEqual([["Mood", "RATING"], ["What happened", "LONG_TEXT"], ["What I learned", "LONG_TEXT"], ["Grateful for", "LONG_TEXT"], ["How I felt", "LONG_TEXT"]]);
    expect(proposal.reminder?.time).toBe("21:00");
    expect(() => projectDef.parse(proposal)).not.toThrow();
  });
  it("validates entries against field definitions", () => {
    const fields = [
      { key: "mood", label: "Mood", type: "RATING", required: true, config: JSON.stringify({ min: 1, max: 5 }) },
      { key: "pages", label: "Pages", type: "NUMBER", required: false, config: "{}" },
      { key: "mins", label: "Minutes", type: "DURATION", required: false, config: "{}" },
      { key: "rate", label: "Rate", type: "FORMULA", required: false, config: JSON.stringify({ expression: "pages / mins * 60" }) },
    ];
    expect(validateEntry(fields, { mood: 7 }).errors).toEqual(["Mood must be ≤ 5"]);
    expect(validateEntry(fields, {}).errors).toEqual(["Mood is required"]);
    expect(validateEntry(fields, { mood: 4, pages: 20, mins: 30 }).values.rate).toBe(40);
  });
});

describe("planning & nutrition math", () => {
  it("parses the reference meal-planning request", () => {
    const r = parsePlanRequest("Plan seven days of dinners using our existing pantry inventory, keep grocery spending under $120 and avoid repeating chicken more than twice.", "2026-11-24");
    expect(r).toMatchObject({ days: 7, slots: ["DINNER"], budgetCents: 12000, maxRepeats: { chicken: 2 }, preferPantry: true, startDate: "2026-11-24" });
  });
  it("computes recipe nutrition only from known data", () => {
    const egg = { name: "Egg", kcalPer100g: 143, proteinPer100g: 12.56, carbsPer100g: 0.72, fatPer100g: 9.51, fibrePer100g: 0, gramsPerMl: null, gramsPerEach: 50, nutritionSource: "USDA_SR28", nutritionVerified: true };
    const n = computeRecipeNutrition({ servings: 2, ingredients: [{ name: "eggs", quantity: 4, unit: "each", optional: false, foodItem: egg }, { name: "mystery", quantity: 1, unit: "each", optional: false, foodItem: null }] });
    expect(n.total.kcal).toBe(286);
    expect(n.perServing.kcal).toBe(143);
    expect(n.verified).toBe(false);
    expect(n.missing).toEqual(["mystery (no nutrition data)"]);
  });
  it("estimates targets with Mifflin–St Jeor and sizes portions", () => {
    const t = estimateTargets({ weightKg: 70, heightCm: 175, birthDate: "1990-01-01", sex: "male", activityLevel: "moderate", goal: "maintain" });
    const age = ageFrom("1990-01-01")!;
    if (!t.ok) throw new Error("expected estimate");
    expect(t.bmr).toBe(Math.round(10 * 70 + 6.25 * 175 - 5 * age + 5));
    expect(t.kcal).toBe(Math.round((t.bmr * 1.55) / 10) * 10);
    expect(t.protein).toBe(Math.round((t.kcal * 0.25) / 4));
    expect(suggestServings(2000, "DINNER", 350)).toBe(2);
    expect(suggestServings(1600, "DINNER", 350)).toBe(1.5);
    expect(suggestServings(null, "DINNER", 350)).toBe(1);
  });
});
