import { describe, it, expect } from "vitest";
import { convert, toGrams, normalizeUnit, parseQuantity, formatQuantity, packagesNeeded, dimensionOf } from "@/lib/units";
import { parseMoneyToCents, formatCents, allocateCents } from "@/lib/money";
import { addDays, addMonths, startOfWeek, ageFrom, daysBetween } from "@/lib/dates";
import { occurrences, nextOccurrence } from "@/lib/recurrence";
import { normalizedUnitPrice } from "@/lib/finance/prices";

describe("units", () => {
  it("converts within and across dimensions", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(2, "lb", "g")).toBeCloseTo(907.18, 1);
    expect(convert(3, "tsp", "tbsp")).toBeCloseTo(1, 6);
    expect(convert(1, "cup", "g", { gramsPerMl: 0.782 })).toBeCloseTo(185.0, 0); // USDA rice density
    expect(convert(1, "cup", "g")).toBeNull(); // no density → refuse to guess
    expect(convert(2, "each", "g", { gramsPerEach: 50 })).toBe(100);
    expect(convert(1, "dozen", "each")).toBe(12);
    expect(convert(2, "clove", "g")).toBeNull();
    expect(toGrams(500, "ml", { gramsPerMl: 1.031 })).toBeCloseTo(515.5, 1);
  });
  it("normalises unit aliases", () => {
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("T")).toBe("tbsp");
    expect(normalizeUnit("cloves")).toBe("clove");
    expect(dimensionOf("fl oz")).toBe("volume");
  });
  it("parses quantities", () => {
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("1½")).toBe(1.5);
    expect(parseQuantity("2-3")).toBe(3);
  });
  it("formats and packages", () => {
    expect(formatQuantity(1500, "g")).toBe("1.5 kg");
    expect(formatQuantity(0.5, "cup")).toBe("½ cup");
    expect(packagesNeeded(1200, 500)).toBe(3);
    expect(packagesNeeded(1000, 500)).toBe(2);
  });
});

describe("money", () => {
  it("parses to exact cents", () => {
    expect(parseMoneyToCents("$1,234.56")).toBe(123456);
    expect(parseMoneyToCents("19.99")).toBe(1999);
    expect(parseMoneyToCents("1234,50")).toBe(123450);
    expect(parseMoneyToCents("0.1")).toBe(10);
    expect(parseMoneyToCents("")).toBeNull();
    expect(formatCents(123456, "USD")).toBe("$1,234.56");
  });
  it("allocates without losing a cent", () => {
    const parts = allocateCents(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("dates & recurrence", () => {
  it("does DST-safe arithmetic", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(ageFrom("1990-06-15", "2026-06-14")).toBe(35);
  });
  it("expands schedules", () => {
    expect(occurrences({ freq: "WEEKLY", interval: 1, byWeekday: "1,4", startDate: "2026-11-02" }, "2026-11-02", "2026-11-15")).toEqual(["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"]);
    expect(occurrences({ freq: "WEEKLY", interval: 2, byWeekday: "1", startDate: "2026-11-02" }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-16", "2026-11-30"]);
    expect(occurrences({ freq: "MONTHLY", interval: 1, byWeekday: "", dayOfMonth: 31, startDate: "2026-01-31" }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrences({ freq: "DAILY", interval: 3, byWeekday: "", startDate: "2026-11-01", endDate: "2026-11-08" }, "2026-11-01", "2026-12-01")).toEqual(["2026-11-01", "2026-11-04", "2026-11-07"]);
    expect(nextOccurrence({ freq: "MONTHLY", interval: 1, byWeekday: "", startDate: "2026-01-15" }, "2026-01-15")).toBe("2026-02-15");
  });
});

describe("unit prices", () => {
  it("normalises packages to per-gram / per-ml / per-item", () => {
    expect(normalizedUnitPrice(499, 1, "kg")).toEqual({ normalizedUnit: "g", unitPrice: 0.499 });
    expect(normalizedUnitPrice(399, 2, "l").unitPrice).toBeCloseTo(0.1995, 6);
    expect(normalizedUnitPrice(600, 12, "each")).toEqual({ normalizedUnit: "each", unitPrice: 50 });
    expect(normalizedUnitPrice(1200, 1, "dozen").unitPrice).toBe(100);
  });
});
