import { describe, it, expect } from "vitest";
import { parseMealRequest } from "@/lib/food/meal-request";

const T = "2026-11-25"; // a Wednesday
const at = (h: number) => new Date(2026, 10, 25, h, 0);

describe("meal requests in the assistant", () => {
  it("add 1 cup plain boiled rice to my lunch today (afternoon → also logged)", () => {
    expect(parseMealRequest("add 1 cup plain boiled rice to my lunch today", T, at(16))).toMatchObject({
      name: "boiled rice", quantity: 1, unit: "cup", date: T, slot: "LUNCH", who: "me", addToPlan: true, logEaten: true,
    });
  });
  it("planning ahead isn't logged as eaten", () => {
    expect(parseMealRequest("put lemon pasta on dinner tomorrow", T, at(9))).toMatchObject({ name: "lemon pasta", date: "2026-11-26", slot: "DINNER", who: "everyone", addToPlan: true, logEaten: false });
    expect(parseMealRequest("add aloo gobi to friday's lunch", T, at(9))).toMatchObject({ date: "2026-11-27", slot: "LUNCH" });
    expect(parseMealRequest("add two eggs to my breakfast tomorrow", T, at(9))).toMatchObject({ quantity: 2, name: "eggs", who: "me", logEaten: false });
  });
  it("'I had …' only logs", () => {
    expect(parseMealRequest("I had 2 rotis for dinner yesterday", T, at(9))).toMatchObject({ quantity: 2, date: "2026-11-24", slot: "DINNER", who: "me", addToPlan: false, logEaten: true });
  });
  it("leaves pantry and shopping requests alone", () => {
    expect(parseMealRequest("add 1 cup rice to the shopping list", T)).toBeNull();
    expect(parseMealRequest("we bought 2 kg rice", T)).toBeNull();
    expect(parseMealRequest("add 2 kg rice", T)).toBeNull();
  });
});
