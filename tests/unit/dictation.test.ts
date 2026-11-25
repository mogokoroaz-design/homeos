import { describe, it, expect } from "vitest";
import { classifyUtterance as c, buildRecipeFromDictation, spokenNumbers } from "@/lib/food/dictation";

describe("dictation", () => {
  it("converts spoken numbers", () => {
    expect(spokenNumbers("two tablespoons of soy sauce")).toBe("2 tablespoons of soy sauce");
    expect(spokenNumbers("half a cup of water")).toBe("1/2 cup of water");
    expect(spokenNumbers("a pinch of salt")).toBe("1 pinch of salt");
    expect(spokenNumbers("one and a half cups rice")).toBe("1.5 cups rice");
  });
  it("detects shopping requests", () => {
    expect(c("add milk and eggs to the shopping list")).toMatchObject({ kind: "shopping", shopping: ["Milk", "Eggs"] });
    expect(c("We're running low on soy sauce.")).toMatchObject({ kind: "shopping", shopping: ["Soy sauce"] });
    expect(c("remind me to buy basil")).toMatchObject({ kind: "shopping", shopping: ["Basil"] });
    expect(c("okay we need more garlic")).toMatchObject({ kind: "shopping", shopping: ["Garlic"] });
  });
  it("detects ingredients with amounts", () => {
    const e = c("Now add two tablespoons of soy sauce and one tablespoon sugar");
    expect(e.kind).toBe("ingredient");
    expect(e.ingredients).toEqual([
      expect.objectContaining({ name: "soy sauce", quantity: 2, unit: "tbsp" }),
      expect.objectContaining({ name: "sugar", quantity: 1, unit: "tbsp" }),
    ]);
    expect(c("500 grams minced chicken").ingredients?.[0]).toMatchObject({ name: "chicken", quantity: 500, unit: "g", note: "minced" });
    expect(c("add salt").ingredients?.[0]).toMatchObject({ name: "salt", quantity: null });
  });
  it("keeps cooking actions as steps", () => {
    expect(c("finely chop the onion garlic and chilli").kind).toBe("step");
    expect(c("add the chicken back and stir until coated").kind).toBe("step");
    expect(c("simmer for 10 minutes").kind).toBe("step");
  });
  it("detects name, servings and notes", () => {
    expect(c("this recipe is called basil chicken")).toMatchObject({ kind: "name", value: "Basil Chicken" });
    expect(c("serves four")).toMatchObject({ kind: "servings", value: "4" });
    expect(c("note: sugar balances the soy")).toMatchObject({ kind: "note", value: "Sugar balances the soy" });
    expect(c("next time use less chilli")).toMatchObject({ kind: "note" });
  });
  it("builds a recipe draft", () => {
    const entries = [
      c("this recipe is called basil chicken", 2),
      c("finely chop onion garlic and chilli", 30),
      c("add 500 grams minced chicken", 300),
      c("add 2 tbsp soy sauce", 600),
      c("add milk to the shopping list", 650),
      c("add 1 tbsp soy sauce", 700),
      c("serves 3", 800),
    ];
    const r = buildRecipeFromDictation(entries, 25 * 60);
    expect(r).toMatchObject({ name: "Basil Chicken", servings: 3, cookMinutes: 25 });
    expect(r.ingredients).toHaveLength(2);
    expect(r.ingredients.find((i) => i.name === "soy sauce")?.quantity).toBe(3);
    expect(r.instructions.split("\n")).toEqual(["Finely chop onion garlic and chilli", "Add 500 grams minced chicken", "Add 2 tbsp soy sauce", "Add 1 tbsp soy sauce"]);
    expect(r.notes).toContain("5:00  Add 500 grams minced chicken");
    expect(r.instructions).not.toContain("milk");
  });
});

import { sessionCommand, asKind } from "@/lib/food/dictation";
describe("dictation controls", () => {
  it("recognises hands-free commands", () => {
    expect(sessionCommand("Pause.")).toBe("pause");
    expect(sessionCommand("okay resume")).toBe("resume");
    expect(sessionCommand("I'm done")).toBe("finish");
    expect(sessionCommand("scratch that")).toBe("undo");
    expect(sessionCommand("add the pasta")).toBeNull();
  });
  it("re-files an entry", () => {
    const e = c("chop two onions", 5);
    expect(asKind(e, "ingredient").ingredients?.[0]).toMatchObject({ quantity: 2, name: expect.stringMatching(/onion/) });
  });
});
