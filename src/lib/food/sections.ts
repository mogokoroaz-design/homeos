// Store sections for the shopping list. Each ingredient's catalogue category maps to a section;
// the household can reorder sections to match their own shop.
export const STORE_SECTIONS = [
  { key: "produce", label: "Fruit & veg", categories: ["vegetable", "fruit"] },
  { key: "meat", label: "Meat & fish", categories: ["meat", "seafood"] },
  { key: "dairy", label: "Dairy & eggs", categories: ["dairy"] },
  { key: "bakery", label: "Bakery", categories: ["bakery"] },
  { key: "pantry", label: "Pantry staples", categories: ["grain", "legume", "oil", "sauce", "spice"] },
  { key: "snacks", label: "Snacks & sweets", categories: ["nut", "sweet", "snack"] },
  { key: "frozen", label: "Frozen", categories: ["frozen"] },
  { key: "drinks", label: "Drinks", categories: ["beverage"] },
  { key: "other", label: "Other", categories: ["other"] },
] as const;
export type SectionKey = (typeof STORE_SECTIONS)[number]["key"];

export function sectionFor(category: string | null | undefined): SectionKey {
  return STORE_SECTIONS.find((s) => (s.categories as readonly string[]).includes(category ?? "other"))?.key ?? "other";
}

/** Category to store when an item is moved to a section (first category of that section). */
export function categoryForSection(key: string) {
  return STORE_SECTIONS.find((s) => s.key === key)?.categories[0] ?? "other";
}

export function orderedSections(saved: string | null | undefined) {
  let order: string[] = [];
  try { order = JSON.parse(saved ?? "[]"); } catch { order = []; }
  const keys = [...order.filter((k) => STORE_SECTIONS.some((s) => s.key === k)), ...STORE_SECTIONS.map((s) => s.key).filter((k) => !order.includes(k))];
  return keys.map((k) => STORE_SECTIONS.find((s) => s.key === k)!);
}
