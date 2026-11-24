// Unit system. Every quantity in HomeOS carries an explicit unit.
// Base units: mass → g, volume → ml, count → each.
// Cross-dimension conversion (e.g. cup of rice → grams) requires a food's density (gramsPerMl)
// or per-item weight (gramsPerEach), which come from USDA SR28 household measures or user input.

export type Dimension = "mass" | "volume" | "count" | "other";

const MASS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const VOLUME: Record<string, number> = {
  ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365,
  "fl oz": 29.5735295625, pint: 473.176473, quart: 946.352946, gallon: 3785.411784,
};
const COUNT: Record<string, number> = { each: 1, dozen: 12 };

const ALIASES: Record<string, string> = {
  gram: "g", grams: "g", gr: "g", g: "g", gms: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg", kg: "kg", kgs: "kg",
  milligram: "mg", milligrams: "mg", mg: "mg",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml", mls: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", l: "l", ltr: "l",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tsps: "tsp", t: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tbl: "tbsp", T: "tbsp",
  cup: "cup", cups: "cup", c: "cup",
  "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz", floz: "fl oz", "fl. oz": "fl oz",
  pint: "pint", pints: "pint", pt: "pint", quart: "quart", quarts: "quart", qt: "quart", gallon: "gallon", gallons: "gallon", gal: "gallon",
  each: "each", ea: "each", piece: "each", pieces: "each", pc: "each", pcs: "each", item: "each", items: "each",
  whole: "each", unit: "each", units: "each", x: "each", "": "each",
  dozen: "dozen", doz: "dozen",
};

// Descriptive units that cannot be converted, kept verbatim (singular form).
const DESCRIPTIVE = [
  "clove", "slice", "can", "tin", "jar", "bunch", "pinch", "dash", "handful", "sprig", "stalk", "head",
  "package", "pack", "packet", "bag", "box", "bottle", "carton", "sheet", "stick", "fillet", "breast", "thigh", "leaf",
];

export const COMMON_UNITS = ["g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "each", "dozen", "clove", "slice", "can", "bunch", "package"];

export function normalizeUnit(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "each";
  const trimmed = raw.trim();
  if (trimmed === "T") return "tbsp";
  const s = trimmed.toLowerCase().replace(/\.$/, "");
  if (s in ALIASES) return ALIASES[s];
  const singularForm = s.replace(/(es|s)$/, "");
  if (DESCRIPTIVE.includes(s)) return s;
  if (DESCRIPTIVE.includes(singularForm)) return singularForm;
  if (DESCRIPTIVE.includes(s.replace(/s$/, ""))) return s.replace(/s$/, "");
  return s || "each";
}

export function isKnownUnit(raw: string) {
  const s = raw.trim().toLowerCase().replace(/\.$/, "");
  return s in ALIASES || DESCRIPTIVE.includes(s) || DESCRIPTIVE.includes(s.replace(/(es|s)$/, "")) || DESCRIPTIVE.includes(s.replace(/s$/, ""));
}

export function dimensionOf(unit: string): Dimension {
  const u = normalizeUnit(unit);
  if (u in MASS) return "mass";
  if (u in VOLUME) return "volume";
  if (u in COUNT) return "count";
  return "other";
}

export function baseUnitOf(dim: Dimension) {
  return dim === "mass" ? "g" : dim === "volume" ? "ml" : dim === "count" ? "each" : null;
}

export interface FoodConversion {
  gramsPerMl?: number | null;
  gramsPerEach?: number | null;
}

/** Quantity expressed in the base unit of its own dimension (g, ml, each). */
export function toBase(qty: number, unit: string): { qty: number; unit: string; dim: Dimension } {
  const u = normalizeUnit(unit);
  if (u in MASS) return { qty: qty * MASS[u], unit: "g", dim: "mass" };
  if (u in VOLUME) return { qty: qty * VOLUME[u], unit: "ml", dim: "volume" };
  if (u in COUNT) return { qty: qty * COUNT[u], unit: "each", dim: "count" };
  return { qty, unit: u, dim: "other" };
}

export function fromBase(qtyBase: number, unit: string): number {
  const u = normalizeUnit(unit);
  if (u in MASS) return qtyBase / MASS[u];
  if (u in VOLUME) return qtyBase / VOLUME[u];
  if (u in COUNT) return qtyBase / COUNT[u];
  return qtyBase;
}

/** Converts to grams if possible (directly, via density, or via per-item weight). */
export function toGrams(qty: number, unit: string, food?: FoodConversion | null): number | null {
  const b = toBase(qty, unit);
  if (b.dim === "mass") return b.qty;
  if (b.dim === "volume" && food?.gramsPerMl) return b.qty * food.gramsPerMl;
  if (b.dim === "count" && food?.gramsPerEach) return b.qty * food.gramsPerEach;
  return null;
}

/** Converts a quantity between any two units, using food data to bridge dimensions. Returns null if impossible. */
export function convert(qty: number, from: string, to: string, food?: FoodConversion | null): number | null {
  const a = toBase(qty, from);
  const targetDim = dimensionOf(to);
  if (a.dim === "other" || targetDim === "other") {
    return normalizeUnit(from) === normalizeUnit(to) ? qty : null;
  }
  if (a.dim === targetDim) return fromBase(a.qty, to);
  const grams = toGrams(qty, from, food);
  if (grams === null) return null;
  if (targetDim === "mass") return fromBase(grams, to);
  if (targetDim === "volume" && food?.gramsPerMl) return fromBase(grams / food.gramsPerMl, to);
  if (targetDim === "count" && food?.gramsPerEach) return fromBase(grams / food.gramsPerEach, to);
  return null;
}

/** Human friendly quantity: 1500 g → "1.5 kg", 0.5 cup → "½ cup". */
export function formatQuantity(qty: number | null | undefined, unit: string) {
  if (qty === null || qty === undefined) return unit || "";
  let q = qty;
  let u = normalizeUnit(unit);
  if (u === "g" && q >= 1000) { q /= 1000; u = "kg"; }
  if (u === "ml" && q >= 1000) { q /= 1000; u = "l"; }
  const fractions: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾", "0.33": "⅓", "0.67": "⅔" };
  let num: string;
  if (["cup", "tsp", "tbsp", "each", "dozen", "oz", "lb"].includes(u) || dimensionOf(u) === "other") {
    const whole = Math.floor(q);
    const f = fractions[String(Math.round((q - whole) * 100) / 100)];
    num = f ? (whole ? `${whole}${f}` : f) : String(Math.round(q * 100) / 100);
  } else {
    num = String(q >= 100 ? Math.round(q) : Math.round(q * 100) / 100);
  }
  return u === "each" ? num : `${num} ${u}`;
}

/** Package-aware rounding for shopping: buy whole packages if a package size is known. */
export function packagesNeeded(requiredBase: number, packageSizeBase: number | null | undefined) {
  if (!packageSizeBase || packageSizeBase <= 0) return null;
  return Math.max(1, Math.ceil(requiredBase / packageSizeBase - 1e-9));
}

/** Parses "1 1/2", "1½", "0.5", "2-3" (takes upper bound) into a number. */
export function parseQuantity(raw: string): number | null {
  const unicode: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅕": 0.2 };
  let s = raw.trim();
  if (!s) return null;
  let total = 0;
  for (const [ch, v] of Object.entries(unicode)) {
    if (s.includes(ch)) {
      total += v;
      s = s.replace(ch, " ").trim();
    }
  }
  if (/^\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?$/.test(s)) {
    return Number(s.split(/[-–]/)[1]);
  }
  for (const part of s.split(/\s+/).filter(Boolean)) {
    if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split("/").map(Number);
      if (!b) return null;
      total += a / b;
    } else if (/^\d+([.,]\d+)?$/.test(part)) {
      total += Number(part.replace(",", "."));
    } else return total || null;
  }
  return total || null;
}

/** Normalized unit-price display, e.g. cents-per-gram → "$4.20 / kg". */
export function unitPriceDisplay(centsPerBase: number, baseUnit: string) {
  if (baseUnit === "g") return { value: centsPerBase * 1000, label: "kg", alt: { value: centsPerBase * MASS.oz, label: "oz" } };
  if (baseUnit === "ml") return { value: centsPerBase * 1000, label: "L", alt: { value: centsPerBase * VOLUME["fl oz"], label: "fl oz" } };
  return { value: centsPerBase, label: "item", alt: null };
}
