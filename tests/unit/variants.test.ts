import { describe, it, expect } from "vitest";
import { adaptRecipe, type AdaptRecipe } from "@/lib/food/variants";

const cheesecake: AdaptRecipe = {
  name: "Apple Cinnamon Cheesecake", notes: "", tags: "dessert",
  instructions: "Blend the apple, cream cheese, eggs and cream.\nBake 70 mins.",
  ingredients: [
    { name: "apple", quantity: 1, unit: "each", note: "", optional: false },
    { name: "cream cheese", quantity: 200, unit: "g", note: "", optional: false },
    { name: "eggs", quantity: 2, unit: "each", note: "", optional: false },
    { name: "cream", quantity: 200, unit: "ml", note: "", optional: false },
    { name: "sugar", quantity: 60, unit: "g", note: "5 tbsp", optional: false },
    { name: "cornstarch", quantity: 20, unit: "g", note: "", optional: false },
  ],
};

describe("recipe adaptation", () => {
  it("makes a dairy-free variant without touching the original", () => {
    const r = adaptRecipe(cheesecake, "make it dairy-free");
    expect(r.draft.name).toBe("Apple Cinnamon Cheesecake (Dairy-free)");
    expect(r.draft.ingredients.map((i) => i.name)).toEqual(["apple", "dairy-free cream cheese", "eggs", "full-fat coconut cream", "sugar", "cornstarch"]);
    expect(r.draft.instructions).toContain("dairy-free cream cheese, eggs and full-fat coconut cream");
    expect(r.draft.tags).toBe("dessert, dairy-free");
    expect(r.draft.notes).toContain("Adapted from “Apple Cinnamon Cheesecake”");
    expect(cheesecake.ingredients[1].name).toBe("cream cheese");
  });
  it("vegan = dairy-free + egg-free, with notes and ratios", () => {
    const r = adaptRecipe(cheesecake, "vegan, less sugar");
    const eggs = r.draft.ingredients.find((i) => i.name === "flax eggs")!;
    expect(eggs.note).toMatch(/ground flaxseed/);
    expect(r.draft.ingredients.find((i) => i.name === "sugar")!.quantity).toBe(40.2);
    expect(r.tips.join(" ")).toMatch(/custards/);
  });
  it("handles swaps, removals and amounts", () => {
    const r = adaptRecipe(cheesecake, "swap cornstarch for arrowroot; without the apple; double the cream; use honey instead of sugar; frobnicate");
    expect(r.draft.ingredients.map((i) => `${i.quantity} ${i.name}`)).toEqual(["200 cream cheese", "2 eggs", "400 cream", "60 honey", "20 arrowroot"]);
    expect(r.unresolved).toEqual(["frobnicate"]);
  });
  it("vegetarian and gluten-free substitutions", () => {
    const pasta: AdaptRecipe = { name: "Chicken pasta", notes: "", tags: "", instructions: "Cook the spaghetti. Fry the chicken thighs in butter with soy sauce.", ingredients: [
      { name: "spaghetti", quantity: 200, unit: "g", note: "", optional: false }, { name: "chicken thighs", quantity: 400, unit: "g", note: "", optional: false },
      { name: "chicken stock", quantity: 250, unit: "ml", note: "", optional: false }, { name: "soy sauce", quantity: 1, unit: "tbsp", note: "", optional: false },
    ] };
    const r = adaptRecipe(pasta, "vegetarian and gluten free");
    expect(r.draft.ingredients.map((i) => i.name)).toEqual(["gluten-free spaghetti", "extra-firm tofu", "vegetable stock", "tamari"]);
    expect(r.draft.instructions).toBe("Cook the gluten-free spaghetti. Fry the extra-firm tofu in butter with tamari.");
  });
});
