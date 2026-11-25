// Food photos → a reviewable list of items for the pantry or shopping list.
//  1. A local vision model (Ollama, e.g. qwen2.5vl:3b) recognises loose and packaged items.
//  2. Without AI, on-device OCR reads product labels ("Greek Yogurt 500 g").
// Nothing is saved here — the person reviews the list first.
import { z } from "zod";
import { ocrImage } from "../finance/ocr";
import { getVisionModel, extractJson, type AIProvider } from "../ai/provider";
import { loadFoodIndex, matchFood, type FoodIndex } from "./catalog";
import { guessCategory } from "./categories";
import { normalizeUnit } from "../units";
import { titleCase } from "../utils";

export interface DetectedItem {
  name: string;
  quantity: number | null;
  unit: string;
  location: "FRIDGE" | "FREEZER" | "PANTRY" | "OTHER";
  foodItemId: string | null;
  source: "vision" | "label";
  evidence?: string;
}

export interface PhotoResult { items: DetectedItem[]; method: "vision" | "label" | "none"; notes: string[] }

const FRIDGE = new Set(["meat", "seafood", "dairy", "vegetable"]);
export function locationFor(category: string): DetectedItem["location"] {
  if (category === "frozen") return "FREEZER";
  return FRIDGE.has(category) ? "FRIDGE" : "PANTRY";
}

// Words that make a label line food-related (in addition to the catalogue and category keywords).
const PACKAGED = /\b(yogh?urt|milk|cheese|butter|cream|eggs?|juice|cereal|granola|muesli|oats|coffee|tea|chocolate|cookies?|biscuits?|crackers?|chips|crisps|pasta|spaghetti|penne|noodles?|rice|flour|sugar|honey|jam|peanut butter|sauce|salsa|hummus|tofu|bread|tortillas?|wraps?|beans|lentils|chickpeas|tomatoes|soup|stock|broth|olive oil|oil|vinegar|ketchup|mayonnaise|mustard|salt|pepper|spices?|nuts|almonds|cashews|seeds|water|soda|kombucha|ice cream|frozen|chicken|beef|pork|salmon|tuna|bacon|sausages?|ham|apples?|bananas?|avocados?|berries|spinach|lettuce|kale|carrots?|onions?|potatoes?|garlic)\b/i;
const QTY = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|ml|l|lb|lbs|oz|fl ?oz|pack|pk|pcs|ct|count|x)\b|(\d+)\s*(eggs?|rolls|bars|cans|pieces)\b/i;
const UNIT_QTY = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|ml|l|lb|lbs|oz|fl ?oz|pack|pk|pcs|ct|count|x)\b/gi;
const NOISE = /\b(net ?wt|net|weight|contents|best before|use by|exp|nutrition|ingredients|serving|per|kcal|calories|organic|natural|new|value|pack|family|size|fresh|premium|original|classic)\b/gi;

function qtyFrom(text: string): { quantity: number | null; unit: string } {
  const m = text.match(QTY);
  if (!m) return { quantity: null, unit: "each" };
  if (m[3]) return { quantity: Number(m[3]), unit: "each" };
  const n = Number(m[1].replace(",", "."));
  const u = m[2].toLowerCase().replace(/\s/g, "");
  const unit = ["pack", "pk", "pcs", "ct", "count", "x"].includes(u) ? "each" : u === "gm" ? "g" : normalizeUnit(u);
  return { quantity: n, unit };
}

function withCatalogue(index: FoodIndex, name: string, quantity: number | null, unit: string, source: DetectedItem["source"], evidence?: string): DetectedItem {
  const food = matchFood(index, name);
  const category = food?.category ?? guessCategory(name);
  return { name: food?.name ?? titleCase(name), quantity, unit: quantity === null ? "each" : unit, location: locationFor(category), foodItemId: food?.id ?? null, source, evidence };
}

function dedupe(items: DetectedItem[]) {
  const out = new Map<string, DetectedItem>();
  for (const it of items) {
    const key = (it.foodItemId ?? it.name).toLowerCase();
    const ex = out.get(key);
    if (!ex) out.set(key, it);
    else if (ex.quantity !== null && it.quantity !== null && ex.unit === it.unit) ex.quantity += it.quantity;
  }
  return [...out.values()];
}

/** Reads printed labels (packaged products). Exported for tests. */
export function itemsFromLabelText(text: string, index: FoodIndex): DetectedItem[] {
  const catalogueNames = index.items.map((i) => i.name.toLowerCase()).filter((n) => n.length > 2);
  const items: DetectedItem[] = [];
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 2);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    const known = catalogueNames.find((n) => lower.includes(n));
    const m = lower.match(PACKAGED);
    if (!known && !m) continue;
    // Name: the food words on the line, without amounts and marketing words, max 4 words.
    const words = line.replace(UNIT_QTY, " ").replace(NOISE, " ").replace(/[^A-Za-z' -]/g, " ").split(/\s+/).filter((w) => w.length > 1);
    let name = words.join(" ");
    if (words.length > 4) {
      const idx = words.findIndex((w) => PACKAGED.test(w) || (known ?? "").includes(w.toLowerCase()));
      name = words.slice(Math.max(0, idx - 2), idx + 1).join(" ");
    }
    if (!name.trim()) continue;
    const q = qtyFrom(line).quantity !== null ? qtyFrom(line) : qtyFrom(lines[i + 1] ?? ""); // size is often on the next line
    items.push(withCatalogue(index, name.toLowerCase(), q.quantity, q.unit, "label", line));
  }
  return dedupe(items).slice(0, 40);
}

const visionSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1).max(80),
    quantity: z.preprocess((v) => (v === null || v === "" ? null : Number(v)), z.number().positive().max(500).nullable()).optional(),
    unit: z.string().max(20).optional(),
  })).max(60),
});

/** Parses a vision model's JSON answer into items. Exported for tests. */
export function itemsFromVisionAnswer(raw: string, index: FoodIndex): DetectedItem[] {
  let json: unknown;
  try { json = extractJson(raw); } catch { return []; }
  const parsed = visionSchema.safeParse(json);
  if (!parsed.success) return [];
  return dedupe(parsed.data.items
    .filter((i) => !/\b(table|counter|bag|box|shelf|fridge|plate|bowl|hand|person|container|jar lid)\b/i.test(i.name) || PACKAGED.test(i.name))
    .map((i) => {
      const unit = i.unit ? (/(bunch|head|loaf|carton|bottle|can|jar|packet|bag)/i.test(i.unit) ? "each" : normalizeUnit(i.unit)) : "each";
      return withCatalogue(index, i.name.toLowerCase(), i.quantity ?? null, unit, "vision");
    }));
}

export async function detectFoodInPhoto(image: Buffer, opts: { model?: AIProvider | null } = {}): Promise<PhotoResult> {
  const index = await loadFoodIndex();
  const notes: string[] = [];
  const model = opts.model === undefined ? await getVisionModel() : opts.model;
  if (model) {
    try {
      const raw = await model.complete({
        system: "You list groceries in photos for a household pantry app. Reply with JSON only.",
        prompt: 'List every food or grocery item you can see. Use short generic names (e.g. "Greek yogurt", "bananas", "eggs"). Count visible units, or read the size on the package (e.g. 500 g, 1 l). JSON: {"items":[{"name":string,"quantity":number|null,"unit":"each"|"g"|"kg"|"ml"|"l"}]}. Do not include furniture, bags or containers.',
        images: [image.toString("base64")],
        json: true, maxTokens: 800, timeoutMs: 120_000,
      });
      const items = itemsFromVisionAnswer(raw, index);
      if (items.length) return { items, method: "vision", notes: [`Recognised by ${model.label} on this Mac. Counts are estimates — check them.`] };
      notes.push("The local vision model didn't find any food items; tried reading labels instead.");
    } catch (e) {
      notes.push(`The local vision model didn't respond (${e instanceof Error ? e.message : "error"}); tried reading labels instead.`);
    }
  }
  try {
    const { text } = await ocrImage(image);
    const items = itemsFromLabelText(text, index);
    if (items.length) {
      return { items, method: "label", notes: [...notes, model ? "Read from product labels." : "Read from product labels with on-device OCR. To recognise loose fruit, veg and unlabelled items too, turn on a local vision model in Settings."] };
    }
  } catch { /* fall through */ }
  return { items: [], method: "none", notes: [...notes, model ? "No food items found — add them below." : "No readable product labels found. Without a vision model HomeOS can only read printed labels; add items below, or turn on a local vision model in Settings to recognise loose items."] };
}
