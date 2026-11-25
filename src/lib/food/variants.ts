// Recipe adaptation ("make it gluten-free", "swap butter for olive oil", "without mushrooms").
// Rule-based substitutions with documented ratios; the result is a draft variant that is reviewed
// and saved as a new recipe — the original is never changed.
import { titleCase } from "../utils";

export interface AdaptIngredient { name: string; quantity: number | null; unit: string; note: string; optional: boolean }
export interface AdaptRecipe { name: string; instructions: string; notes: string; tags: string; ingredients: AdaptIngredient[] }

interface Sub { re: RegExp; to: string; ratio?: number; unit?: string; note?: string }

// Common 1:1 swaps unless a ratio is given. Order matters: specific before general.
const SUBS: Record<string, { label: string; tag: string; subs: Sub[]; tip?: string }> = {
  "gluten-free": { label: "Gluten-free", tag: "gluten-free", subs: [
    { re: /\b(all[- ]purpose |plain |self[- ]raising |wheat |bread |cake )?flour\b/i, to: "gluten-free flour blend", note: "1:1 blend with xanthan gum" },
    { re: /\bpanko\b|\bbread ?crumbs?\b/i, to: "gluten-free breadcrumbs" },
    { re: /\b(spaghetti|penne|fusilli|linguine|fettuccine|macaroni|lasagne|lasagna|pasta|orzo)\b/i, to: "gluten-free $1" },
    { re: /\begg noodles?|\bnoodles?\b/i, to: "rice noodles" },
    { re: /\bsoy sauce\b/i, to: "tamari", note: "gluten-free soy sauce" },
    { re: /\bcouscous|bulgur\b/i, to: "quinoa" },
    { re: /\bbarley|farro|spelt\b/i, to: "brown rice" },
    { re: /\b(flour |wheat )?tortillas?\b/i, to: "corn tortillas" },
    { re: /\b(rolled |porridge )?oats\b/i, to: "certified gluten-free oats" },
    { re: /\bbeer\b/i, to: "gluten-free beer" },
    { re: /\bbread\b/i, to: "gluten-free bread" },
  ], tip: "Check labels — stock, sauces and spice mixes can contain hidden gluten." },
  "dairy-free": { label: "Dairy-free", tag: "dairy-free", subs: [
    { re: /\bcream cheese\b/i, to: "dairy-free cream cheese" },
    { re: /\bsour cream\b/i, to: "dairy-free sour cream" },
    { re: /\b(heavy |double |single |whipping |thickened )?cream\b/i, to: "full-fat coconut cream" },
    { re: /\bbuttermilk\b/i, to: "oat milk + 1 tbsp lemon juice", note: "mix and rest 5 min" },
    { re: /\bcondensed milk\b/i, to: "coconut condensed milk" },
    { re: /\b(whole |skim |semi-skimmed |full-fat )?milk\b/i, to: "oat milk" },
    { re: /\bghee\b/i, to: "coconut oil" },
    { re: /\b(unsalted |salted )?butter\b/i, to: "plant-based butter" },
    { re: /\bparmesan|pecorino\b/i, to: "nutritional yeast", ratio: 0.5, note: "about half the amount" },
    { re: /\b(greek |natural |plain )?(yogurt|yoghurt)\b/i, to: "coconut yogurt" },
    { re: /\b(mozzarella|cheddar|feta|ricotta|mascarpone|cheese)\b/i, to: "dairy-free $1" },
    { re: /\bpaneer\b/i, to: "firm tofu" },
  ] },
  "egg-free": { label: "Egg-free", tag: "egg-free", subs: [
    { re: /\b(large |medium |whole )?eggs?\b/i, to: "flax eggs", note: "each = 1 tbsp ground flaxseed + 3 tbsp water, rest 10 min" },
    { re: /\bmayonnaise|mayo\b/i, to: "vegan mayonnaise" },
  ], tip: "Egg swaps work best in cakes, muffins and binders; set custards and soufflés may not hold." },
  "nut-free": { label: "Nut-free", tag: "nut-free", subs: [
    { re: /\b(peanut|almond|cashew) butter\b/i, to: "sunflower seed butter" },
    { re: /\balmond milk\b/i, to: "oat milk" },
    { re: /\b(almond|ground almond)s? (flour|meal)\b|\bground almonds\b/i, to: "sunflower seed flour" },
    { re: /\b(walnuts?|pecans?|cashews?|almonds?|hazelnuts?|pistachios?|peanuts?|pine nuts?|macadamias?)\b/i, to: "pumpkin seeds" },
  ] },
  vegetarian: { label: "Vegetarian", tag: "vegetarian", subs: [
    { re: /\b(chicken|beef|vegetable|bone)? ?(stock|broth)\b/i, to: "vegetable stock" },
    { re: /\b(ground |minced )?(beef|pork|lamb|turkey) mince\b|\bground (beef|pork|lamb|turkey)\b|\bmince\b/i, to: "cooked brown lentils", note: "or plant-based mince" },
    { re: /\bbacon|pancetta\b/i, to: "smoked tempeh" },
    { re: /\b(chicken|turkey)( breasts?| thighs?| pieces| fillets?)?\b/i, to: "extra-firm tofu", note: "pressed and cubed" },
    { re: /\b(beef|pork|lamb)( chunks| shoulder| steak| loin)?\b|\bsteak\b/i, to: "portobello mushrooms" },
    { re: /\bsausages?\b/i, to: "vegetarian sausages" },
    { re: /\bfish sauce\b/i, to: "soy sauce" },
    { re: /\b(salmon|cod|tuna|white fish|fish)( fillets?)?\b|\b(shrimp|prawns?)\b/i, to: "chickpeas" },
    { re: /\bgelatin(e)?\b/i, to: "agar agar", ratio: 0.5, note: "use half; boil to set" },
    { re: /\banchov(y|ies)\b/i, to: "capers" },
  ], tip: "Worcestershire sauce and some cheeses (parmesan) contain animal products — look for vegetarian versions." },
  "lower-sugar": { label: "Lower sugar", tag: "lower-sugar", subs: [
    { re: /\b(caster |granulated |brown |white |icing |powdered )?sugar\b/i, to: "$&", ratio: 0.67, note: "reduced by a third" },
    { re: /\b(honey|maple syrup|golden syrup)\b/i, to: "$&", ratio: 0.67, note: "reduced by a third" },
  ] },
};
SUBS.vegan = { label: "Vegan", tag: "vegan", subs: [
  ...SUBS.vegetarian.subs, ...SUBS["dairy-free"].subs, ...SUBS["egg-free"].subs,
  { re: /\bhoney\b/i, to: "maple syrup" },
], tip: "Check sugar, wine and bread labels — some aren't vegan." };

export const ADAPT_PRESETS = Object.entries(SUBS).map(([key, v]) => ({ key, label: v.label }));

export interface AdaptResult { draft: AdaptRecipe; changes: string[]; unresolved: string[]; tips: string[]; label: string }

// Ingredients that are already a substitute are left alone.
const ALREADY_ADAPTED = /\b(gluten[- ]free|dairy[- ]free|vegan|plant[- ]based|flax|oat milk|coconut|tofu|tempeh|lentils?|vegetable stock|tamari|sunflower|pumpkin seeds|agar|nutritional yeast|quinoa|corn tortillas|rice noodles|brown rice|capers|chickpeas|portobello|vegetarian)\b/i;

type Renames = [string, string][];

/** Applies all ingredient renames to the method text at once (longest first, so "cream cheese" isn't hit by "cream"). */
function renameInSteps(text: string, renames: Renames) {
  const pairs = renames.filter(([a, b]) => a.trim() && a !== b).sort((x, y) => y[0].length - x[0].length);
  let out = text;
  pairs.forEach(([from], i) => { out = out.replace(new RegExp(`\\b${from.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), `\u0000${i}\u0000`); });
  pairs.forEach(([, to], i) => { out = out.split(`\u0000${i}\u0000`).join(to); });
  return out;
}

function applyPreset(draft: AdaptRecipe, key: string, changes: string[], tips: string[], renames: Renames) {
  const preset = SUBS[key];
  for (const ing of draft.ingredients) {
    const sub = preset.subs.find((x) => x.re.test(ing.name) && (x.to === "$&" || !ALREADY_ADAPTED.test(ing.name)));
    if (!sub) continue;
    const before = ing.name;
    const to = sub.to === "$&" ? ing.name : ing.name.replace(sub.re, sub.to).replace(/\s+/g, " ").trim();
    const name = sub.to.includes("$") ? to : sub.to;
    if (ing.quantity !== null && sub.ratio) ing.quantity = Math.round(ing.quantity * sub.ratio * 100) / 100;
    if (sub.unit) ing.unit = sub.unit;
    ing.name = name;
    if (sub.note) ing.note = [sub.note, ing.note].filter(Boolean).join("; ");
    renames.push([before, name]);
    changes.push(name === before ? `${before}: ${sub.note ?? "adjusted"}` : `${before} → ${name}${sub.ratio && sub.ratio !== 1 ? ` (×${sub.ratio})` : ""}`);
  }
  if (preset.tip && !tips.includes(preset.tip)) tips.push(preset.tip);
  if (key === "vegan" && SUBS["egg-free"].tip && !tips.includes(SUBS["egg-free"].tip)) tips.push(SUBS["egg-free"].tip);
  draft.tags = [...new Set([...draft.tags.split(",").map((t) => t.trim()).filter(Boolean), preset.tag])].join(", ");
}

/** Exact name first, then the shortest ingredient containing the word ("cream" → cream, not cream cheese). */
function findIng(draft: AdaptRecipe, target: string) {
  const t = target.toLowerCase().replace(/^(the|my|some|all)\s+/, "").trim();
  const sing = t.replace(/s$/, "");
  const names = draft.ingredients.map((i) => i.name.toLowerCase());
  let idx = names.findIndex((n) => n === t || n === sing || n.replace(/s$/, "") === sing);
  if (idx >= 0) return idx;
  const re = new RegExp(`\\b${sing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  let best = -1;
  names.forEach((n, i) => { if (re.test(n) && (best < 0 || n.length < names[best].length)) best = i; });
  idx = best;
  return idx >= 0 ? idx : names.findIndex((n) => t.includes(n.replace(/s$/, "")));
}

/** Applies one or more adaptation instructions to a copy of the recipe. */
export function adaptRecipe(recipe: AdaptRecipe, instruction: string): AdaptResult {
  const draft: AdaptRecipe = JSON.parse(JSON.stringify(recipe));
  const changes: string[] = [];
  const unresolved: string[] = [];
  const tips: string[] = [];
  const labels: string[] = [];
  const renames: Renames = [];
  const parts = instruction.split(/\n|;|,(?![^(]*\))|\band also\b|\bthen\b/i).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    const presets = Object.keys(SUBS).filter((k) => new RegExp(k === "lower-sugar" ? "less sugar|lower sugar|low sugar|reduce sugar|healthier" : k === "nut-free" ? "nut[- ]free|no nuts|without nuts" : k === "egg-free" ? "egg[- ]free|no eggs?|without eggs?|eggless" : k.replace("-", "[- ]?"), "i").test(p));
    if (presets.length && !/\b(swap|replace|instead)\b/.test(p)) {
      // "vegan" already includes vegetarian/dairy-free/egg-free
      const chosen = presets.includes("vegan") ? presets.filter((k) => !["vegetarian", "dairy-free", "egg-free"].includes(k)) : presets;
      for (const k of chosen) { applyPreset(draft, k, changes, tips, renames); labels.push(SUBS[k].label); }
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = part.match(/^(?:swap|replace|substitute|use)\s+(.+?)\s+(?:for|with|by)\s+(.+)$/i)) || (m = part.match(/^(?:use\s+)?(.+?)\s+instead of\s+(.+)$/i))) {
      const [from, to] = /instead of/i.test(part) ? [m[2], m[1].replace(/^use\s+/i, "")] : [m[1], m[2]];
      const i = findIng(draft, from);
      if (i < 0) { unresolved.push(part); continue; }
      const before = draft.ingredients[i].name;
      draft.ingredients[i].name = to.trim();
      renames.push([before, to.trim()]);
      changes.push(`${before} → ${to.trim()}`);
      labels.push(`with ${to.trim()}`);
      continue;
    }
    if ((m = part.match(/^(?:without|no|remove|leave out|skip|omit|drop)\s+(?:the\s+)?(.+)$/i))) {
      for (const t of m[1].split(/\band\b|&/).map((s) => s.trim()).filter(Boolean)) {
        const i = findIng(draft, t);
        if (i < 0) { unresolved.push(`without ${t}`); continue; }
        changes.push(`Removed ${draft.ingredients[i].name}`);
        labels.push(`no ${draft.ingredients[i].name}`);
        draft.ingredients.splice(i, 1);
      }
      continue;
    }
    if ((m = part.match(/^(double|triple|halve|half|more|less|extra|reduce)\s+(?:the\s+)?(.+)$/i))) {
      const i = findIng(draft, m[2]);
      const f = { double: 2, triple: 3, halve: 0.5, half: 0.5, more: 1.5, extra: 1.5, less: 0.67, reduce: 0.67 }[m[1].toLowerCase() as "double"]!;
      if (i < 0 || draft.ingredients[i].quantity === null) { unresolved.push(part); continue; }
      draft.ingredients[i].quantity = Math.round(draft.ingredients[i].quantity! * f * 100) / 100;
      changes.push(`${draft.ingredients[i].name} ×${f}`);
      continue;
    }
    if ((m = part.match(/^(?:add|plus|with)\s+(.+)$/i))) {
      draft.ingredients.push({ name: m[1].trim(), quantity: null, unit: "", note: "added — set amount", optional: false });
      changes.push(`Added ${m[1].trim()}`);
      continue;
    }
    unresolved.push(part);
  }
  draft.instructions = renameInSteps(draft.instructions, renames);
  const label = labels.length ? labels.map((l) => (l.startsWith("with ") || l.startsWith("no ") ? l : titleCase(l))).join(", ") : "adapted";
  draft.name = `${recipe.name} (${label})`.slice(0, 160);
  if (changes.length) draft.notes = [`Adapted from “${recipe.name}”: ${changes.join("; ")}.`, ...tips, recipe.notes].filter(Boolean).join("\n");
  return { draft, changes, unresolved, tips, label };
}

