import { describe, it, expect } from "vitest";
import { parseRecipeText, decodeEntities, cleanRecipeText, parseIngredientLine } from "@/lib/food/parse";

// The caption as Instagram delivered it (hex-encoded characters, keycap emoji steps, decorated headings).
const CAPTION = `12K likes, 85 comments - bakewithme on November 3, 2026: "Apple Cinnamon Cheesecake &#x1f34e;&#x2728;
No crust, made in a blender!
&#x2014;&#x2014;&#x2014; Ingredients &#x2014;&#x2014;&#x2014;
1 apple (130-140g after peeling)
200g cream cheese
2 eggs
200ml cream
60g sugar (5 tbsp)
20g cornstarch (2 tbsp)
2g cinnamon (1 tsp)
15g lemon juice (1 tbsp)
&#x3000;
&#x2014;&#x2014;&#x2014; Steps &#x2014;&#x2014;&#x2014;
1&#xfe0f;&#x20e3; Preheat oven to 170&#x2103; / 340&#x2109;.
2&#xfe0f;&#x20e3; Add all ingredients to a blender or mixer &#x2192; blend until completely smooth.
3&#xfe0f;&#x20e3; Pour into a lined loaf pan &#x2192; water-bath bake at 160&#x2103; / 320&#x2109; for 70 mins.
4&#xfe0f;&#x20e3; Let it cool &#x2192; cover and chill in the fridge (overnight is best!).
Enjoy &#x263a;&#xfe0f;
&#x2014;&#x2014;&#x2014; Tip &#x2014;&#x2014;&#x2014;
The apple was 130-140g after peeling&#x1f34e;
If you don&#x2019;t have a blender, or if your blender can&#x2019;t blend the apple finely enough, grate the apple first instead.
#cheesecake #applerecipe @bakewithme".`;

describe("social caption → structured recipe", () => {
  const r = parseRecipeText(CAPTION);
  it("decodes every entity form", () => {
    expect(decodeEntities("&#x2014; &#8212; &mdash; don&#x2019;t 170&#x2103;")).toBe("— — — don’t 170℃");
    expect(cleanRecipeText(CAPTION).join("\n")).not.toMatch(/&#|#cheesecake|@bakewithme|likes,/);
  });
  it("extracts the title", () => expect(r.name).toBe("Apple Cinnamon Cheesecake"));
  it("builds an ingredient table", () => {
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name, i.note])).toEqual([
      [1, "each", "apple", "130-140g after peeling"],
      [200, "g", "cream cheese", ""],
      [2, "each", "eggs", ""],
      [200, "ml", "cream", ""],
      [60, "g", "sugar", "5 tbsp"],
      [20, "g", "cornstarch", "2 tbsp"],
      [2, "g", "cinnamon", "1 tsp"],
      [15, "g", "lemon juice", "1 tbsp"],
    ]);
  });
  it("builds clean numbered steps", () => {
    expect(r.instructions).toEqual([
      "Preheat oven to 170°C / 340°F.",
      "Add all ingredients to a blender or mixer → blend until completely smooth.",
      "Pour into a lined loaf pan → water-bath bake at 160°C / 320°F for 70 mins.",
      "Let it cool → cover and chill in the fridge (overnight is best!).",
    ]);
  });
  it("extracts temperature, cook time and tips", () => {
    expect(r.temperature).toBe("170°C / 340°F");
    expect(r.cookMinutes).toBe(70);
    expect(r.notes).toContain("grate the apple first instead");
    expect(r.notes).not.toMatch(/Enjoy/);
    expect(r.warnings.some((w) => /Servings/.test(w))).toBe(true);
  });
});

describe("other caption styles", () => {
  it("handles quantity-after-name lines and ingredient groups", () => {
    expect(parseIngredientLine("Cream cheese - 200g")).toMatchObject({ quantity: 200, unit: "g", name: "Cream cheese" });
    const r = parseRecipeText("Easy Tart\nServes 6\nIngredients:\nFor the crust:\n150g flour\nButter 75g\nFor the filling:\n3 eggs\nMethod:\n1. Mix the crust.\n2. Bake for 20 minutes.\n3. Fill and bake 25 min more.");
    expect(r.servings).toBe(6);
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name, i.note])).toEqual([[150, "g", "flour", "for the crust"], [75, "g", "Butter", "for the crust"], [3, "each", "eggs", "for the filling"]]);
    expect(r.instructions).toHaveLength(3);
    expect(r.cookMinutes).toBe(45);
  });
});
