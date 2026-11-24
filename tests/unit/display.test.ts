import { describe, it, expect } from "vitest";
import { displayQuantity, findTimers, formatClock } from "@/lib/food/display";

const t = (q: number | null, u: string, f: number, s: "original" | "metric" | "imperial", food?: { gramsPerMl?: number }) => displayQuantity(q, u, f, s, food).text;

describe("recipe quantities", () => {
  it("scales servings", () => {
    expect(t(200, "g", 2, "original")).toBe("400 g");
    expect(t(3, "each", 0.5, "original")).toBe("1½");
    expect(t(1.5, "cup", 2, "original")).toBe("3 cup");
  });
  it("converts to metric", () => {
    expect(t(1, "lb", 1, "metric")).toBe("455 g");
    expect(t(2, "cup", 1, "metric")).toBe("475 ml");
    expect(t(5, "cup", 1, "metric")).toBe("1.18 l");
    expect(t(2, "tbsp", 1, "metric")).toBe("2 tbsp"); // spoons stay spoons
    expect(t(2, "each", 1, "metric")).toBe("2");
  });
  it("converts to imperial using density when known", () => {
    expect(t(200, "ml", 1, "imperial")).toBe("¾ cup");
    expect(t(15, "ml", 1, "imperial")).toBe("1 tbsp");
    expect(t(5, "ml", 1, "imperial")).toBe("1 tsp");
    expect(t(200, "g", 1, "imperial", { gramsPerMl: 0.53 })).toBe("1½ cup"); // flour ≈ 0.53 g/ml
    expect(t(200, "g", 1, "imperial")).toBe("7 oz"); // no density → weight
    expect(t(1000, "g", 1, "imperial")).toBe("2¼ lb");
  });
  it("leaves unquantified ingredients alone", () => {
    expect(displayQuantity(null, "", 2, "imperial").qty).toBeNull();
  });
});

describe("step timers", () => {
  it("finds durations", () => {
    expect(findTimers("Water-bath bake at 160°C for 70 mins.")).toEqual([{ label: "70 mins", seconds: 4200 }]);
    expect(findTimers("Simmer 8–10 minutes, then rest 30 seconds.")).toEqual([{ label: "8–10 minutes", seconds: 600 }, { label: "30 seconds", seconds: 30 }]);
    expect(findTimers("Roast for 1 hour 15 minutes")[0].seconds).toBe(4500);
    expect(findTimers("Add 2 eggs and 200 g sugar")).toEqual([]);
    expect(formatClock(4200)).toBe("1:10:00");
    expect(formatClock(65)).toBe("1:05");
  });
});
