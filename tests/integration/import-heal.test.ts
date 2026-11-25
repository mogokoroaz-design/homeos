import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { reextractImport } from "@/lib/food/importer";

beforeAll(async () => { await seedHousehold(); });

describe("drafts saved by the old parser", () => {
  it("are re-read cleanly from the stored caption", async () => {
    const raw = "Bread Rolls\nIngredients:\n&#x2022; Whole wheat flour &#x2013; 2 cups\n&#x2022; Honey &#x2013; 1 tbsp\nMethod:\n1&#xfe0f;&#x20e3; Mix everything.";
    const stale = { name: "Bread Rolls", ingredients: [{ name: "&#x2022; wheat flour &#x2013; 2 cups", quantity: null, unit: "", note: "whole", optional: false }] };
    const imp = await prisma.recipeImport.create({ data: { method: "INSTAGRAM", rawText: raw, extracted: JSON.stringify(stale) } });
    await reextractImport(imp.id);
    const fixed = JSON.parse((await prisma.recipeImport.findUniqueOrThrow({ where: { id: imp.id } })).extracted);
    expect(fixed.ingredients.map((i: { quantity: number; unit: string; name: string }) => [i.quantity, i.unit, i.name])).toEqual([[2, "cup", "Whole wheat flour"], [1, "tbsp", "Honey"]]);
    expect(JSON.stringify(fixed)).not.toMatch(/&#|•/);
  });
});
