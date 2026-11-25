// Normalises a recipe draft from any source (website data, AI, OCR, older imports, sessionStorage)
// into the exact shape the recipe editor expects, so odd data can never crash the page.
const str = (v: unknown, max = 20000): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => str(x, max)).filter(Boolean).join(v.every((x) => typeof x === "string" && x.length < 60) ? ", " : "\n").slice(0, max);
  if (typeof v === "object") return str((v as Record<string, unknown>).text ?? (v as Record<string, unknown>).name ?? "", max);
  return String(v).slice(0, max);
};
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const CATS = ["breakfast", "main", "side", "salad", "soup", "snack", "dessert", "drink", "sauce", "other"];

export interface CleanDraft {
  name: string; cuisine: string; category: string; servings: number; prepMinutes: number | null; cookMinutes: number | null; temperature: string;
  instructions: string; sourceType: string; sourceUrl: string | null; notes: string; tags: string; favourite: boolean; variantOfId?: string | null;
  ingredients: { name: string; quantity: number | null; unit: string; note: string; optional: boolean; foodItemId?: string | null }[];
}

export function cleanDraft(raw: unknown, fallback: { sourceType?: string; sourceUrl?: string | null } = {}): CleanDraft {
  const d = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const cat = str(d.category).toLowerCase();
  const ingredients = (Array.isArray(d.ingredients) ? d.ingredients : [])
    .map((i) => (typeof i === "string" ? { name: i } : i && typeof i === "object" ? (i as Record<string, unknown>) : null))
    .filter((i): i is Record<string, unknown> => Boolean(i))
    .map((i) => ({ name: str(i.name, 160).trim(), quantity: numOrNull(i.quantity), unit: str(i.unit, 30), note: str(i.note, 200), optional: Boolean(i.optional), foodItemId: typeof i.foodItemId === "string" ? i.foodItemId : null }))
    .filter((i) => i.name)
    .slice(0, 100);
  return {
    name: str(d.name, 160).trim(),
    cuisine: str(d.cuisine, 60),
    category: CATS.includes(cat) ? cat : cat.includes("dessert") || cat.includes("cookie") || cat.includes("cake") ? "dessert" : "main",
    servings: Math.min(100, numOrNull(d.servings) ?? 2),
    prepMinutes: numOrNull(d.prepMinutes) === null ? null : Math.round(numOrNull(d.prepMinutes)!),
    cookMinutes: numOrNull(d.cookMinutes) === null ? null : Math.round(numOrNull(d.cookMinutes)!),
    temperature: str(d.temperature, 40),
    instructions: str(d.instructions),
    sourceType: str(d.sourceType, 20) || fallback.sourceType || "MANUAL",
    sourceUrl: str(d.sourceUrl, 1000) || fallback.sourceUrl || null,
    notes: str(d.notes, 10000),
    tags: str(d.tags, 300),
    favourite: Boolean(d.favourite),
    variantOfId: typeof d.variantOfId === "string" ? d.variantOfId : null,
    ingredients,
  };
}
