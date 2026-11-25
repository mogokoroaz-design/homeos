// Reading packaged food on this Mac: product name + size from the front, nutrition from the back,
// and the barcode. All local (sharp + Tesseract + ZXing). The optional Open Food Facts lookup is the
// only network call, sends only the barcode number, and runs only when the person allows it.
import path from "node:path";
import fs from "node:fs/promises";
import { cacheDir } from "../paths";
import { appleOcr, rowsFromBoxes } from "../ocr/apple";
import { prepareForOcr } from "../finance/ocr";
import { loadReference } from "./reference";
import { normalizeName, singular, titleCase } from "../utils";

export interface OcrLine { text: string; height: number; conf: number; words: { text: string; conf: number }[] }
export interface NutritionPer100 { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null }
export interface NutritionLabel { per100g: NutritionPer100; servingGrams: number | null; basis: "per100" | "serving"; fields: number }
export interface LabelProduct { name: string; quantity: number | null; unit: string; evidence: string }

// ── OCR at several sizes (big headline text is only read once shrunk; small print needs full size) ──
export async function ocrLines(image: Buffer): Promise<{ lines: OcrLine[]; text: string; engine: "apple" | "tesseract" }> {
  // On a Mac: Apple's on-device text recognition reads headline lettering and small print in one pass.
  try {
    const prepared = await prepareForOcr(image, 2400);
    const apple = await appleOcr(prepared.png, prepared);
    if (apple && apple.boxes.length) {
      const lines: OcrLine[] = apple.boxes.map((b) => ({ text: b.text.trim(), height: b.h * apple.height, conf: b.conf >= 0.3 ? 90 : 40, words: b.text.trim().split(/\s+/).map((w) => ({ text: w, conf: b.conf >= 0.3 ? 90 : 40 })) })); // Apple's confidence is coarse (0.3 / 0.5 / 1)
      return { lines, text: rowsFromBoxes(apple.boxes).join("\n"), engine: "apple" };
    }
  } catch { /* fall back to Tesseract */ }
  const sharp = (await import("sharp")).default;
  const { createWorker } = await import("tesseract.js");
  const base = sharp(image, { failOn: "none" }).rotate(); // honour phone orientation
  const meta = await base.metadata();
  const mw = meta.autoOrient?.width ?? meta.width ?? 1800;
  const long = Math.max(mw, meta.autoOrient?.height ?? meta.height ?? 1800);
  const width0 = Math.round(mw * Math.min(1, 1800 / long));
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  await fs.mkdir(cacheDir(), { recursive: true });
  const worker = await createWorker("eng", 1, { langPath, cachePath: cacheDir(), gzip: true, logger: () => undefined, errorHandler: () => undefined });
  const seen = new Map<string, OcrLine>();
  const texts: string[] = [];
  try {
    // Full size for small print; down to ~250 px wide so huge headline lettering is readable too.
    const widths = [...new Set([width0, Math.min(width0, 1000), Math.min(width0, 500), Math.min(width0, 250)])];
    for (const w of widths) {
      const scale = w / width0;
      const buf = await sharp(image, { failOn: "none" }).rotate().resize(w).grayscale().normalize().png().toBuffer();
      const { data } = await worker.recognize(buf, {}, { blocks: true, text: true });
      texts.push(data.text ?? "");
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
        const words = l.words.map((w) => ({ text: w.text, conf: w.confidence })).filter((w) => w.text.trim());
        const text = words.map((w) => w.text).join(" ").trim();
        if (!text) continue;
        const line = { text, height: (l.bbox.y1 - l.bbox.y0) / scale, conf: l.confidence, words };
        const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
        const prev = seen.get(key);
        if (!prev || prev.conf < line.conf) seen.set(key, line);
      }
    }
  } finally {
    await worker.terminate();
  }
  return { lines: [...seen.values()], text: texts.join("\n"), engine: "tesseract" };
}

// ── Food vocabulary: every word used in USDA food names + common pantry words ──
const STOP = new Set(["and", "with", "without", "raw", "from", "the", "for", "made", "added", "type", "style", "all", "includes", "only", "not", "other", "prepared", "commercially", "ready", "serve", "regular", "plain", "whole", "fresh", "new", "net", "weight", "contents", "per", "serving", "nutrition", "facts", "ingredients", "best", "before", "use", "pack", "value", "saver", "brand", "organic", "natural", "premium", "original", "classic", "family", "size", "product", "made", "usa", "distributed", "keep", "store", "refrigerate", "after", "opening", "vegan", "gluten", "free"]);
let vocab: Set<string> | null = null;
export function foodVocabulary() {
  if (!vocab) {
    vocab = new Set<string>();
    for (const f of loadReference().foods) {
      for (const seg of f.name.split(",").slice(0, 3)) for (const w of normalizeName(seg).split(" ")) if (w.length >= 3 && !STOP.has(w) && /^[a-z]+$/.test(w)) vocab.add(singular(w));
    }
    for (const w of ["hoisin", "sriracha", "gochujang", "tahini", "hummus", "granola", "muesli", "kombucha", "paneer", "ghee", "masala", "basmati", "jasmine", "penne", "fusilli", "ramen", "udon", "soba", "tortilla", "salsa", "pesto", "kimchi", "miso", "tofu", "tempeh", "quinoa", "couscous", "oat", "yoghurt", "biscuit", "crisp", "chilli", "coriander", "aubergine", "courgette", "granulated", "caster", "icing", "self", "raising", "atta", "besan", "dal", "rajma", "chana", "jaggery"]) vocab.add(w);
  }
  return vocab;
}
const isFoodWord = (w: string) => foodVocabulary().has(singular(w.toLowerCase().replace(/[^a-z]/g, "")));

const QTY_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gr|ml|cl|l|lb|lbs|oz|fl\.?\s?oz)\b/gi;
const METRIC: Record<string, string> = { kg: "kg", g: "g", gm: "g", gr: "g", ml: "ml", cl: "cl", l: "l" };

/** Package size, preferring metric ("NET WT 10.23 OZ (290g)" → 290 g). */
export function packageSize(text: string): { quantity: number; unit: string } | null {
  const found: { n: number; u: string; net: boolean }[] = [];
  for (const m of text.matchAll(QTY_RE)) {
    const u = m[2].toLowerCase().replace(/[\s.]/g, "");
    const n = Number(m[1].replace(",", "."));
    if (!(n > 0) || n > 50000) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 25), m.index ?? 0).toLowerCase();
    found.push({ n, u, net: /net|wt|weight|contents|e\s*$/.test(before) || /\(\s*$/.test(before) });
  }
  if (!found.length) return null;
  const metric = found.filter((f) => METRIC[f.u]);
  const pick = metric.find((f) => f.net) ?? metric[0] ?? found.find((f) => f.net) ?? found[0];
  const unit = METRIC[pick.u] ?? (pick.u.startsWith("fl") ? "fl oz" : pick.u.startsWith("lb") ? "lb" : pick.u);
  return unit === "cl" ? { quantity: pick.n * 10, unit: "ml" } : { quantity: pick.n, unit };
}

const HEAD = /\b(sauce|sugar|flour|oil|rice|milk|paste|juice|powder|butter|cheese|yogh?urt|cream|vinegar|syrup|honey|jam|spread|bread|pasta|noodles?|beans|lentils|seeds|nuts|tea|coffee|water|stock|broth|soup|chips|crisps|cookies|biscuits|cereal|oats|salt|pepper|spice|masala|mix|dressing|ketchup|mayo(nnaise)?|mustard|salsa|chutney|pickle)\b/i;

/** The product name: the largest confidently-read text that contains food words. */
export function productFromLines(lines: OcrLine[], fullText: string): LabelProduct | null {
  const good = lines.map((l) => {
    const words = l.words.filter((w) => w.conf >= 60 && /^[A-Za-z][A-Za-z'&-]{1,}$/.test(w.text.replace(/[^A-Za-z'&-]/g, "")) && w.text.replace(/[^A-Za-z]/g, "").length >= 3)
      .map((w) => w.text.replace(/[^A-Za-z'&-]/g, ""));
    const food = words.filter(isFoodWord);
    return { ...l, words, food };
  }).filter((l) => l.food.length && !/(nutrition|ingredients|calories|serving|allergen|contains|distributed|manufactured|warning|directions)/i.test(l.text));
  if (!good.length) return null;
  good.sort((a, b) => b.height * (0.5 + b.food.length / b.words.length) - a.height * (0.5 + a.food.length / a.words.length));
  const top = good[0];
  // A second large food line next to it ("Sugar" + "Granulated", "Hoisin" + "Sauce").
  const second = good.find((l) => l !== top && l.height >= top.height * 0.3 && l.words.length <= 3 && l.food.length === l.words.length);
  let words = top.words.length <= 4 ? top.words : top.food.slice(0, 4);
  if (second && words.length + second.words.length <= 4) {
    // The generic noun goes last: "Granulated" + "Sugar", "Hoisin" + "Sauce".
    words = HEAD.test(words.join(" ")) && !HEAD.test(second.words.join(" ")) ? [...second.words, ...words] : HEAD.test(second.words.join(" ")) ? [...words, ...second.words] : [...second.words, ...words];
  }
  const seen = new Set<string>();
  words = words.filter((w) => { const k = w.toLowerCase(); if (seen.has(k) || STOP.has(k)) return false; seen.add(k); return true; });
  if (!words.length) return null;
  const size = packageSize(fullText);
  return { name: titleCase(words.join(" ").toLowerCase()), quantity: size?.quantity ?? null, unit: size?.unit ?? "each", evidence: [second?.text, top.text].filter(Boolean).join(" / ") };
}

// ── Nutrition facts / nutrition information panels ──
const num = (s: string | undefined) => (s === undefined ? null : Number(s.replace(",", ".")));
function grab(text: string, label: RegExp): number | null {
  const m = text.match(new RegExp(`(?:${label.source})[^\\d\\n]{0,24}(\\d+(?:[.,]\\d+)?)\\s*(?:g|mg)?`, "i"));
  return m ? num(m[1]) : null;
}

/** Parses a photographed nutrition panel (US "Nutrition Facts" or EU/UK/IN "per 100 g"). */
export function parseNutritionPanel(raw: string): NutritionLabel | null {
  const text = raw.replace(/\bO(?=\s?g\b)/g, "0").replace(/(\d)\s?9\b(?=\s*(?:\n|$|\d|[A-Za-z]))/g, "$1g").replace(/[|]/g, " ");
  if (!/(nutrition|calories|energy|protein|total fat|carbohydrate)/i.test(text)) return null;
  const serving = text.match(/serving size[^\n(]*\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)?/i);
  const servingGrams = serving ? num(serving[1]) : null;
  const per100 = /per\s*100\s*(g|ml)|100\s*(g|ml)\s*(contains|provides)?/i.test(text);
  let kcal = (() => { const k = text.match(/(\d+(?:[.,]\d+)?)\s*kcal/i); if (k) return num(k[1]); const c = text.match(/calories[^\d\n]{0,12}(\d+)/i); return c ? num(c[1]) : null; })();
  if (kcal === null) { const kj = text.match(/(\d+(?:[.,]\d+)?)\s*kj/i); if (kj) kcal = Math.round(num(kj[1])! / 4.184); }
  const vals = {
    kcal,
    fat: grab(text, /(?:total\s+)?fat/),
    carbs: grab(text, /(?:total\s+)?carbohydrates?|total\s+carbs?\.?/),
    protein: grab(text, /protein/),
    fibre: grab(text, /(?:dietary\s+)?fib(?:re|er)/),
  };
  const fields = Object.values(vals).filter((v) => v !== null).length;
  if (fields < 2) return null;
  const basis: NutritionLabel["basis"] = per100 ? "per100" : "serving";
  const factor = basis === "per100" ? 1 : servingGrams ? 100 / servingGrams : null;
  if (factor === null) return null; // per-serving values without a gram weight can't be turned into per-100 g
  const scale = (v: number | null) => (v === null ? null : Math.round(v * factor * 10) / 10);
  const per100g: NutritionPer100 = { kcal: scale(vals.kcal), protein: scale(vals.protein), carbs: scale(vals.carbs), fat: scale(vals.fat), fibre: scale(vals.fibre) };
  // Sanity: per-100 g values can't exceed physical limits.
  if ((per100g.kcal ?? 0) > 950 || [per100g.protein, per100g.carbs, per100g.fat, per100g.fibre].some((v) => (v ?? 0) > 100)) return null;
  return { per100g, servingGrams, basis, fields };
}

// ── Barcodes (EAN/UPC) — decoded locally with ZXing (WebAssembly) ──
let zxingReady: Promise<typeof import("zxing-wasm/reader")> | null = null;
async function zxing() {
  if (!zxingReady) {
    zxingReady = (async () => {
      const mod = await import("zxing-wasm/reader");
      const wasm = await fs.readFile(path.join(process.cwd(), "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm"));
      await mod.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
      return mod;
    })();
  }
  return zxingReady;
}

export async function decodeBarcode(image: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { readBarcodes } = await zxing();
    for (const width of [1600, 1000, 2400]) {
      const { data, info } = await sharp(image, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: width > 1600 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const results = await readBarcodes({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height, colorSpace: "srgb" } as ImageData, { formats: ["EAN-13", "EAN-8", "UPC-A", "UPC-E"], tryHarder: true, maxNumberOfSymbols: 1 });
      const hit = results.find((r) => r.isValid && /^\d{8,14}$/.test(r.text));
      if (hit) return hit.text;
    }
  } catch { /* no barcode */ }
  return null;
}

// ── Open Food Facts (free, open database). Only the barcode number is sent. ──
export interface OffProduct { name: string; brand: string; quantity: number | null; unit: string; nutrition: NutritionPer100 | null }

export function parseOffProduct(json: unknown): OffProduct | null {
  const p = (json as { status?: number; product?: Record<string, unknown> })?.product;
  if (!p) return null;
  const name = String(p.product_name_en || p.product_name || p.generic_name || "").trim();
  if (!name) return null;
  const n = (p.nutriments ?? {}) as Record<string, number | string | undefined>;
  const v = (k: string) => (n[k] === undefined || n[k] === "" ? null : Math.round(Number(n[k]) * 10) / 10);
  const kcal = v("energy-kcal_100g") ?? (v("energy_100g") !== null ? Math.round(v("energy_100g")! / 4.184) : null);
  const nutrition = { kcal, protein: v("proteins_100g"), carbs: v("carbohydrates_100g"), fat: v("fat_100g"), fibre: v("fiber_100g") };
  const size = packageSize(String(p.quantity ?? ""));
  return { name: titleCase(name.toLowerCase()), brand: String(p.brands ?? "").split(",")[0].trim(), quantity: size?.quantity ?? null, unit: size?.unit ?? "each", nutrition: Object.values(nutrition).some((x) => x !== null) ? nutrition : null };
}

export async function lookupOpenFoodFacts(barcode: string): Promise<OffProduct | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_en,generic_name,brands,quantity,nutriments`, {
    headers: { "User-Agent": "HomeOS/1.0 (local household app)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return parseOffProduct(await res.json());
}
