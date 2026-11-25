import { describe, it, expect } from "vitest";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { ocrLines, productFromLines, parseNutritionPanel, packageSize, decodeBarcode, parseOffProduct } from "@/lib/food/label";

const svgPng = (w: number, h: number, body: string, bg = "#fff") => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`)).png().toBuffer();

describe("reading packaged food labels (on-device)", () => {
  it("finds the product in big headline text and the metric net weight", async () => {
    const png = await svgPng(900, 700, `
      <text x="60" y="90" font-size="40" fill="#fff" font-family="Arial">amazon saver</text>
      <text x="60" y="260" font-size="150" font-weight="bold" fill="#fff" font-family="Arial">Sugar</text>
      <text x="60" y="350" font-size="60" fill="#f5c542" font-family="Arial">Granulated</text>
      <text x="60" y="620" font-size="34" fill="#fff" font-family="Arial">NET WT 4 LB (1.81 kg)</text>`, "#d8342c");
    const { lines, text } = await ocrLines(png);
    expect(productFromLines(lines, text)).toMatchObject({ name: "Granulated Sugar", quantity: 1.81, unit: "kg" });
  }, 60_000);

  it("reads a jar label", async () => {
    const png = await svgPng(800, 600, `
      <text x="60" y="80" font-size="36" fill="#fff" font-family="Georgia">TRADER JOE'S</text>
      <text x="60" y="230" font-size="130" fill="#fff" font-family="Georgia" font-style="italic">Hoisin</text>
      <text x="60" y="330" font-size="70" fill="#fff" font-family="Arial">SAUCE</text>
      <text x="60" y="500" font-size="30" fill="#fff" font-family="Arial">NET WT 10.23 OZ (290g)</text>`, "#b3171c");
    const { lines, text } = await ocrLines(png);
    expect(productFromLines(lines, text)).toMatchObject({ name: "Hoisin Sauce", quantity: 290, unit: "g" });
  }, 60_000);

  it("reads a US nutrition facts panel and converts to per 100 g", async () => {
    const rows = ["Nutrition Facts", "Serving size 1 Tbsp (17g)", "Calories 35", "Total Fat 0.5g", "Sodium 250mg", "Total Carbohydrate 7g", "Dietary Fiber 0g", "Protein 1g"];
    const png = await svgPng(700, 560, rows.map((r, i) => `<text x="40" y="${60 + i * 62}" font-size="${i === 0 ? 48 : 32}" font-weight="${i === 0 ? "bold" : "normal"}" font-family="Arial" fill="#000">${r}</text>`).join(""));
    const { text } = await ocrLines(png);
    const n = parseNutritionPanel(text);
    expect(n?.servingGrams).toBe(17);
    expect(n?.per100g.kcal).toBeCloseTo(205.9, 0);
    expect(n?.per100g.carbs).toBeCloseTo(41.2, 0);
    expect(n?.per100g.protein).toBeCloseTo(5.9, 0);
  }, 60_000);

  it("decodes an EAN-13 barcode in a photo", async () => {
    const w = await import("zxing-wasm/writer");
    const wasm = await fs.readFile(path.join(process.cwd(), "node_modules/zxing-wasm/dist/writer/zxing_writer.wasm"));
    await w.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
    const out = await w.writeBarcode("5012345678900", { format: "EAN-13", scale: 4 });
    const svg = out.svg;
    const code = await sharp(Buffer.from(svg)).flatten({ background: "#fff" }).extend({ top: 80, bottom: 80, left: 80, right: 80, background: "#fff" }).png().toBuffer();
    expect(await decodeBarcode(code)).toBe("5012345678900");
  }, 60_000);
});

describe("label parsing", () => {
  it("prefers metric net weight", () => {
    expect(packageSize("NET WT 10.23 OZ (290g)")).toEqual({ quantity: 290, unit: "g" });
    expect(packageSize("e 500ml")).toEqual({ quantity: 500, unit: "ml" });
    expect(packageSize("no size")).toBeNull();
  });
  it("parses an EU per-100 g panel", () => {
    const n = parseNutritionPanel("Nutrition information\nTypical values per 100g\nEnergy 1700kJ / 400kcal\nFat 0g\nCarbohydrate 100g\nProtein 0g");
    expect(n).toMatchObject({ basis: "per100", per100g: { kcal: 400, fat: 0, carbs: 100, protein: 0 } });
  });
  it("rejects text that isn't a panel", () => {
    expect(parseNutritionPanel("Hoisin sauce 290 g")).toBeNull();
  });
  it("reads an Open Food Facts answer", () => {
    expect(parseOffProduct({ status: 1, product: { product_name: "Hoisin Sauce", brands: "Trader Joe's", quantity: "290 g", nutriments: { "energy-kcal_100g": 220, proteins_100g: 3.3, carbohydrates_100g: 44, fat_100g: 3.4 } } }))
      .toEqual({ name: "Hoisin Sauce", brand: "Trader Joe's", quantity: 290, unit: "g", nutrition: { kcal: 220, protein: 3.3, carbs: 44, fat: 3.4, fibre: null } });
    expect(parseOffProduct({ status: 0 })).toBeNull();
  });
});
