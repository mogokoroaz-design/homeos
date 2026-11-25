// Client-safe helpers for showing recipes: unit-system conversion with kitchen-friendly rounding,
// and timer detection in method steps. Pure functions — no database access.
import { normalizeUnit, toBase, dimensionOf, formatQuantity, type FoodConversion } from "../units";

export type UnitSystem = "original" | "metric" | "imperial";

const ML = { tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365, "fl oz": 29.5735295625 };
const G = { oz: 28.349523125, lb: 453.59237 };

function nearest(value: number, step: number) {
  return Math.max(step, Math.round(value / step) * step);
}

/** Rounds to fractions cooks actually measure: ¼ cup, ½ tbsp, ¼ tsp; whole grams / ½ oz. */
function niceVolume(ml: number): { qty: number; unit: string } {
  if (ml >= ML.cup / 4 - 1) return { qty: nearest(ml / ML.cup, 0.25), unit: "cup" };
  if (ml >= ML.tbsp - 0.5) return { qty: nearest(ml / ML.tbsp, 0.5), unit: "tbsp" };
  return { qty: nearest(ml / ML.tsp, 0.25), unit: "tsp" };
}

function niceGrams(g: number): { qty: number; unit: string } {
  if (g >= 1000) return { qty: Math.round(g / 10) / 100, unit: "kg" };
  if (g >= 100) return { qty: nearest(g, 5), unit: "g" };
  if (g >= 10) return { qty: Math.round(g), unit: "g" };
  return { qty: Math.round(g * 10) / 10, unit: "g" };
}

function niceMl(ml: number): { qty: number; unit: string } {
  if (ml >= 1000) return { qty: Math.round(ml / 10) / 100, unit: "l" };
  if (ml >= 100) return { qty: nearest(ml, 5), unit: "ml" };
  return { qty: Math.round(ml), unit: "ml" };
}

export interface DisplayQty { qty: number | null; unit: string; text: string; converted: boolean }

/**
 * Scales and (optionally) converts an ingredient quantity for display.
 * Metric: oz/lb → g/kg, cups/fl oz → ml (spoons are kept — they're used in metric recipes too).
 * Imperial: g → cups/spoons when the food's density is known, otherwise oz/lb; ml → cups/spoons.
 */
// Things US recipes measure in cups/spoons; everything else by weight stays a weight (oz / lb).
const CUP_FOODS = /\b(flour|sugar|rice|oats?|cocoa|cornmeal|semolina|starch|cornstarch|salt|baking|yeast|spice|powder|honey|syrup|milk|yogh?urt|curd|cream|oil|ghee|butter|stock|broth|water|juice|sauce|vinegar|nuts|almonds|seeds|raisins|lentils|quinoa|couscous|breadcrumbs|chocolate chips|coconut|peas|corn|beans)\b/i;

export function displayQuantity(quantity: number | null, unit: string, factor: number, system: UnitSystem, food?: (FoodConversion & { name?: string }) | null): DisplayQty {
  if (quantity === null) return { qty: null, unit, text: "", converted: false };
  const q = quantity * factor;
  const u = normalizeUnit(unit);
  const dim = dimensionOf(u);
  const done = (r: { qty: number; unit: string }, converted: boolean): DisplayQty => ({ ...r, text: formatQuantity(r.qty, r.unit), converted });
  if (system === "original" || dim === "count" || dim === "other") {
    return done({ qty: Math.round(q * 100) / 100, unit: u }, false);
  }
  const base = toBase(q, u).qty; // g or ml
  if (system === "metric") {
    if (dim === "mass") return done(niceGrams(base), !["g", "kg", "mg"].includes(u));
    if (["tsp", "tbsp"].includes(u)) return done({ qty: nearest(q, u === "tsp" ? 0.25 : 0.5), unit: u }, false);
    return done(niceMl(base), !["ml", "l"].includes(u));
  }
  // imperial
  if (dim === "volume") {
    if (["tsp", "tbsp", "cup"].includes(u)) return done({ qty: nearest(q, u === "cup" ? 0.25 : u === "tbsp" ? 0.5 : 0.25), unit: u }, false);
    return done(niceVolume(base), true);
  }
  if (food?.gramsPerMl && food.gramsPerMl > 0 && (!food.name || CUP_FOODS.test(food.name))) return done(niceVolume(base / food.gramsPerMl), true);
  if (["oz", "lb"].includes(u)) return done({ qty: Math.round(q * 100) / 100, unit: u }, false);
  if (base >= G.lb) return done({ qty: nearest(base / G.lb, 0.25), unit: "lb" }, true);
  return done({ qty: base / G.oz >= 10 ? Math.round(base / G.oz) : nearest(base / G.oz, 0.5), unit: "oz" }, true);
}

export interface StepTimer { label: string; seconds: number }

/** Finds durations in a method step: "bake for 70 mins", "8–10 minutes", "1 hour 15 min", "30 seconds". */
export function findTimers(step: string): StepTimer[] {
  const out: StepTimer[] = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b(?:\s*(?:and\s+)?(\d+)\s*(minutes?|mins?))?/gi;
  for (const m of step.matchAll(re)) {
    const lo = Number(m[1].replace(",", "."));
    const hi = m[2] ? Number(m[2].replace(",", ".")) : null;
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith("h") ? 3600 : unit.startsWith("s") ? 1 : 60;
    let seconds = (hi ?? lo) * mult;
    if (m[4]) seconds += Number(m[4]) * 60;
    if (seconds <= 0 || seconds > 48 * 3600) continue;
    const label = m[0].replace(/\s+/g, " ").trim();
    out.push({ label, seconds: Math.round(seconds) });
  }
  return out;
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
