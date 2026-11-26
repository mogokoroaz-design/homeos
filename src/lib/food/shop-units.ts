// Recipe amounts → what you actually put in the basket. Nobody buys 0.55 ml of ajwain or
// 710 ml of cauliflower: spices and condiments are bought as a pack (and skipped if you have any),
// produce as whole items or bunches, and bulk goods rounded up to normal pack sizes.
import { toBase, formatQuantity, convert } from "../units";

export interface ShopAmount { skip: boolean; quantity: number; unit: string; recipeUses: string | null }
interface FoodLike { category?: string | null; gramsPerMl?: number | null; gramsPerEach?: number | null }

const NOT_FOOD = /\b(instructions?|method|steps?|directions|garnish(?:ing)?|for serving|serving suggestion|notes?|equipment|ingredients?|quantity|optional)\b/i;
const STAPLE_CATEGORIES = new Set(["spice", "oil", "sauce", "condiment", "baking", "sweet"]);
const STAPLE_WORDS = /\b(salt|pepper|spice|powder|seeds?|masala|turmeric|cumin|coriander powder|chilli flakes|paprika|cinnamon|cardamom|cloves?|nutmeg|oregano|thyme|bay lea(f|ves)|ajwain|amchur|hing|asafoetida|garam|curry|baking (soda|powder)|yeast|vanilla|extract|essence|vinegar|soy sauce|fish sauce|oyster sauce|hoisin|ketchup|mustard|mayonnaise|honey|sugar|oil|ghee|stock cubes?|bouillon|cornstarch|corn ?flour|custard powder|cocoa)\b/i;
const HERBS = /\b(cilantro|coriander leaves|coriander|mint|basil|parsley|dill|chives|curry leaves|spring onions?|green onions?|scallions?|methi|fenugreek leaves|thai basil|rosemary|sage|lemongrass)\b/i;

const niceRecipe = (qty: number, unit: string) => {
  const b = toBase(qty, unit);
  if (b.dim === "volume" && b.qty < 15) return formatQuantity(Math.round((b.qty / 4.93) * 4) / 4 || 0.25, "tsp");
  if (b.dim === "volume" && b.qty < 60) return formatQuantity(Math.round((b.qty / 14.79) * 2) / 2 || 0.5, "tbsp");
  return formatQuantity(Math.round(qty * 100) / 100, unit);
};
const roundUp = (grams: number, steps: number[]) => steps.find((s) => grams <= s) ?? Math.ceil(grams / 500) * 500;

/**
 * @param need amount still needed after pantry stock (null = "as needed" / no amount)
 * @param haveAny whether the pantry has any of it at all
 */
export function shoppingAmount(name: string, need: number | null, unit: string, food: FoodLike | null, haveAny: boolean): ShopAmount {
  if (NOT_FOOD.test(name)) return { skip: true, quantity: 0, unit: "", recipeUses: null };
  const recipeUses = need !== null && need > 0 ? niceRecipe(need, unit) : null;
  const staple = STAPLE_CATEGORIES.has(food?.category ?? "") || STAPLE_WORDS.test(name);
  // Spices, condiments, oils, baking: one pack — unless there's some at home already.
  if (staple && !HERBS.test(name)) {
    const b = need === null ? null : toBase(need, unit);
    const smallAmount = !b || (b.dim === "mass" && b.qty < 250) || (b.dim === "volume" && b.qty < 250) || b.dim === "other";
    if (haveAny && smallAmount) return { skip: true, quantity: 0, unit: "", recipeUses };
    if (smallAmount) return { skip: false, quantity: 1, unit: "pack", recipeUses };
  }
  if (need === null) return haveAny ? { skip: true, quantity: 0, unit: "", recipeUses } : { skip: false, quantity: 1, unit: HERBS.test(name) ? "bunch" : "pack", recipeUses };
  if (need <= 0) return { skip: true, quantity: 0, unit: "", recipeUses };
  if (HERBS.test(name)) return { skip: false, quantity: 1, unit: "bunch", recipeUses };
  const b = toBase(need, unit);
  if (b.dim === "count") return { skip: false, quantity: Math.ceil(b.qty - 1e-9), unit: "each", recipeUses };
  // Produce bought by the piece when we know what one weighs (1 cauliflower ≈ 575 g).
  const isProduce = food?.category === "vegetable" || food?.category === "fruit";
  const grams = b.dim === "mass" ? b.qty : convert(need, unit, "g", { gramsPerMl: food?.gramsPerMl ?? null, gramsPerEach: food?.gramsPerEach ?? null });
  if (isProduce && food?.gramsPerEach && grams !== null) return { skip: false, quantity: Math.max(1, Math.ceil(grams / food.gramsPerEach - 0.15)), unit: "each", recipeUses };
  if (b.dim === "volume" && (grams === null || !isProduce)) {
    const ml = roundUp(b.qty, [250, 500, 1000, 2000]);
    return ml >= 1000 ? { skip: false, quantity: ml / 1000, unit: "l", recipeUses } : { skip: false, quantity: ml, unit: "ml", recipeUses };
  }
  if (grams !== null) {
    const g = roundUp(grams, [100, 250, 500, 1000, 1500, 2000]);
    return g >= 1000 ? { skip: false, quantity: g / 1000, unit: "kg", recipeUses } : { skip: false, quantity: g, unit: "g", recipeUses };
  }
  return { skip: false, quantity: Math.ceil(need), unit, recipeUses };
}
