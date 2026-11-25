import { describe, it, expect } from "vitest";
import { parseDietPrefs, recipeViolations, dietBadges, describeDiet } from "@/lib/food/diet";

describe("diet preferences", () => {
  it("parses free text", () => {
    const p = parseDietPrefs("Vegetarian, no shellfish, allergic to peanuts, avoid mushrooms and I don't eat coriander");
    expect(p.rules.sort()).toEqual(["no-shellfish", "nut-free", "vegetarian"]);
    expect(p.avoid).toEqual(["mushroom", "coriander"]);
    expect(describeDiet(parseDietPrefs("halal, lactose intolerant"))).toEqual(["Dairy-free", "No pork"]);
    expect(parseDietPrefs("").rules).toEqual([]);
  });
  it("flags conflicting ingredients and ignores look-alikes", () => {
    const ing = (...n: string[]) => n.map((name) => ({ name }));
    expect(recipeViolations(ing("chicken thighs", "spinach"), parseDietPrefs("vegetarian"))).toEqual([{ ingredient: "chicken thighs", reason: "Vegetarian" }]);
    expect(recipeViolations(ing("peanut butter", "oat milk"), parseDietPrefs("dairy-free"))).toEqual([]);
    expect(recipeViolations(ing("peanut butter"), parseDietPrefs("nut allergy"))).toHaveLength(1);
    expect(recipeViolations(ing("gluten-free pasta", "rice noodles", "cream of tartar"), parseDietPrefs("coeliac, dairy free"))).toEqual([]);
    expect(recipeViolations(ing("spaghetti", "butter"), parseDietPrefs("gluten free"))).toEqual([{ ingredient: "spaghetti", reason: "Gluten-free" }]);
    expect(recipeViolations(ing("button mushrooms", "eggplant"), parseDietPrefs("avoid mushrooms, egg free"))).toEqual([{ ingredient: "button mushrooms", reason: "No mushroom" }]);
    expect(recipeViolations([{ name: "parmesan", optional: true }], parseDietPrefs("vegan"))).toEqual([]);
  });
  it("labels recipes", () => {
    expect(dietBadges([{ name: "cream cheese" }, { name: "eggs" }, { name: "sugar" }, { name: "cornstarch" }])).toEqual(["vegetarian", "gluten-free", "nut-free"]);
    expect(dietBadges([{ name: "chickpeas" }, { name: "olive oil" }])).toEqual(["vegan", "gluten-free", "dairy-free", "nut-free"]);
  });
});
