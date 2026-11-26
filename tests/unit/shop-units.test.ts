import { describe, it, expect } from "vitest";
import { shoppingAmount as s } from "@/lib/food/shop-units";

describe("shopping amounts", () => {
  it("spices: a pack, or nothing if there's some at home", () => {
    expect(s("Ajwain Seed", 0.55, "ml", { category: "spice" }, false)).toMatchObject({ skip: false, quantity: 1, unit: "pack", recipeUses: "¼ tsp" });
    expect(s("Amchur Powder Dry Mango Powder", 4.93, "ml", { category: "other" }, true)).toMatchObject({ skip: true });
    expect(s("Butter", null, "", { category: "dairy" }, true)).toMatchObject({ skip: true });
  });
  it("produce: whole items and bunches", () => {
    expect(s("Cauliflower Florets", 710, "ml", { category: "vegetable", gramsPerMl: 0.42, gramsPerEach: 575 }, false)).toMatchObject({ quantity: 1, unit: "each" });
    expect(s("Onion", 450, "g", { category: "vegetable", gramsPerEach: 150 }, false)).toMatchObject({ quantity: 3, unit: "each" });
    expect(s("Cilantro", 2.01, "g", { category: "vegetable" }, false)).toMatchObject({ quantity: 1, unit: "bunch" });
  });
  it("bulk goods: normal pack sizes", () => {
    expect(s("Chicken Breast", 380, "g", { category: "meat" }, false)).toMatchObject({ quantity: 500, unit: "g" });
    expect(s("Basmati Rice", 1200, "g", { category: "grain" }, false)).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(s("Milk", 300, "ml", { category: "dairy" }, false)).toMatchObject({ quantity: 500, unit: "ml" });
    expect(s("Bacon Strip", 3.5, "each", { category: "meat" }, false)).toMatchObject({ quantity: 4, unit: "each" });
  });
  it("drops recipe-import junk", () => {
    expect(s("Cooking Instruction", null, "", null, false)).toMatchObject({ skip: true });
  });
});
