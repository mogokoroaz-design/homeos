import { describe, it, expect } from "vitest";
import type { FoodItem } from "@prisma/client";
import { itemsFromLabelText, itemsFromVisionAnswer, locationFor } from "@/lib/food/photo";

const food = (id: string, name: string, category: string) => ({ id, name, category } as unknown as FoodItem);
const index = { items: [food("00000000-0000-4000-8000-000000000001", "Greek yogurt", "dairy"), food("00000000-0000-4000-8000-000000000002", "Spinach", "vegetable")], aliases: new Map<string, string>() };

describe("food photo — labels", () => {
  it("reads product names and sizes from label text", () => {
    const items = itemsFromLabelText("FAGE\nGREEK YOGURT 500 g\nWHOLE MILK\n1 L\nNet wt 12 eggs\nBest before 12/12", index);
    const byName = Object.fromEntries(items.map((i) => [i.name.toLowerCase(), i]));
    expect(byName["greek yogurt"]).toMatchObject({ quantity: 500, unit: "g", location: "FRIDGE", foodItemId: index.items[0].id });
    expect(byName["whole milk"]).toMatchObject({ quantity: 1, unit: "l", location: "FRIDGE" });
    expect(byName["eggs"]).toMatchObject({ quantity: 12, unit: "each" });
    expect(items.find((i) => /best/i.test(i.name))).toBeUndefined();
  });
  it("ignores text with no food words", () => {
    expect(itemsFromLabelText("TOTAL 12.99\nTHANK YOU\nVISA", index)).toEqual([]);
  });
});

describe("food photo — vision answers", () => {
  it("parses JSON, maps to catalogue, drops non-food", () => {
    const raw = 'Here you go: {"items":[{"name":"spinach","quantity":1,"unit":"bunch"},{"name":"bananas","quantity":"6","unit":"each"},{"name":"wooden table","quantity":1}]}';
    const items = itemsFromVisionAnswer(raw, index);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Spinach", quantity: 1, unit: "each", foodItemId: index.items[1].id, source: "vision" });
    expect(items[1]).toMatchObject({ name: "Bananas", quantity: 6, location: "PANTRY" });
  });
  it("returns nothing for garbage", () => {
    expect(itemsFromVisionAnswer("I can't see", index)).toEqual([]);
  });
  it("picks storage by category", () => {
    expect(locationFor("frozen")).toBe("FREEZER");
    expect(locationFor("grain")).toBe("PANTRY");
  });
});
