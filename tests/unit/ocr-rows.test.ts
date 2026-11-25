import { describe, it, expect } from "vitest";
import { rowsFromBoxes } from "@/lib/ocr/apple";

describe("Apple text boxes → receipt rows", () => {
  it("joins item and price printed on the same row, top to bottom", () => {
    const b = (text: string, x: number, y: number, h = 0.02) => ({ text, conf: 1, x, y, w: 0.2, h });
    const rows = rowsFromBoxes([b("4.99", 0.8, 0.301), b("TOTAL", 0.05, 0.5), b("GREEK YOGURT", 0.05, 0.3), b("CORNER MARKET", 0.3, 0.1), b("9.48", 0.8, 0.498), b("MILK 1L", 0.05, 0.35), b("4.49", 0.8, 0.352)]);
    expect(rows).toEqual(["CORNER MARKET", "GREEK YOGURT   4.99", "MILK 1L   4.49", "TOTAL   9.48"]);
  });
});
