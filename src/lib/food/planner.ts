// Deterministic meal-plan proposal engine. Produces a proposal only; nothing is written
// until the user approves it (Recommend → Preview → Approve → Execute → Record).
import { prisma } from "../db";
import { addDays, today, weekday, weekdayName } from "../dates";
import { checkRecipeAgainstPantry } from "./recipes";
import { pantryByFood } from "./pantry";
import { estimatePrice } from "./grocery";
import { wordToNumber } from "./parse";
import { SLOTS } from "../validation";
import { normalizeName } from "../utils";
import { parseDietPrefs, recipeViolations, describeDiet } from "./diet";

export interface PlanRequest {
  startDate: string;
  days: number;
  slots: string[];
  budgetCents: number | null;
  maxRepeats: Record<string, number>; // term → max meals containing it
  exclude: string[];
  preferPantry: boolean;
  servings: number | null; // household servings per meal; null = recipe default
  diet?: string; // diet words in the request itself, e.g. "vegetarian dinners"
  ignoreDiets?: boolean; // "ignore diets" — skip household members' preferences
}

export function parsePlanRequest(text: string, ref = today()): PlanRequest {
  const t = text.toLowerCase();
  const daysMatch = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen)\s*(?:days?|nights?|dinners|lunches|breakfasts|meals)/);
  let days = daysMatch ? wordToNumber(daysMatch[1]) ?? 7 : /week/.test(t) ? 7 : /tomorrow/.test(t) ? 1 : 7;
  if (/two weeks|fortnight/.test(t)) days = 14;
  days = Math.min(28, Math.max(1, Math.round(days)));
  const slots = SLOTS.filter((s) => new RegExp(`\\b${s.toLowerCase()}`).test(t));
  const budget = t.match(/(?:under|below|less than|max(?:imum)?|budget(?: of)?|within|no more than)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  const maxRepeats: Record<string, number> = {};
  for (const m of t.matchAll(/(?:avoid|no|don'?t|not)\s+(?:repeating|having|more)?\s*([a-z ]+?)\s+more than\s+(once|twice|\w+|\d+)(?:\s+times?)?/g)) {
    const n = m[2] === "once" ? 1 : m[2] === "twice" ? 2 : wordToNumber(m[2]) ?? 2;
    maxRepeats[m[1].replace(/^(repeating|having)\s+/, "").trim()] = n;
  }
  const exclude = [...t.matchAll(/\b(?:no|without|exclude|avoid)\s+([a-z]+)(?!\s+more than)/g)].map((m) => m[1]).filter((w) => !["repeating", "more", "going", "grocery", "shopping"].includes(w));
  const start = /tomorrow/.test(t) ? addDays(ref, 1) : /next week/.test(t) ? addDays(ref, ((8 - weekday(ref)) % 7) || 7) : ref;
  const serv = t.match(/(?:for|serves?)\s+(\d+)\s+(?:people|persons|servings)/);
  return { startDate: start, days, slots: slots.length ? slots : ["DINNER"], budgetCents: budget ? Math.round(Number(budget[1]) * 100) : null, maxRepeats, exclude, preferPantry: /pantry|what we have|already (?:own|have)|existing|in stock|use up/.test(t), servings: serv ? Number(serv[1]) : null, diet: text, ignoreDiets: /ignore (our |the )?diets?|any diet/.test(t) };
}

export interface ProposedMeal {
  date: string;
  slot: string;
  recipeId: string;
  title: string;
  coverage: number;
  missing: string[];
  estCostCents: number;
  unpricedItems: string[];
}

export interface PlanProposal {
  request: PlanRequest;
  meals: ProposedMeal[];
  totalKnownCostCents: number;
  unpriced: string[];
  warnings: string[];
  occupied: string[];
}

function recipeTerms(r: { name: string; ingredients: { name: string }[] }) {
  return normalizeName([r.name, ...r.ingredients.map((i) => i.name)].join(" "));
}

export async function proposeMealPlan(req: PlanRequest): Promise<PlanProposal> {
  const warnings: string[] = [];
  const slotCats: Record<string, string[]> = { BREAKFAST: ["breakfast"], LUNCH: ["main", "salad", "soup", "side"], DINNER: ["main", "soup"], SNACK: ["snack", "dessert"] };
  const all = await prisma.recipe.findMany({ include: { ingredients: { include: { foodItem: true } } } });
  // Diets: each member's saved preferences (shared meals must suit everyone) + diet words in the request.
  const members = req.ignoreDiets ? [] : await prisma.householdProfile.findMany({ select: { name: true, dietPreferences: true } });
  const dietSets = [...members.map((m) => ({ who: m.name, prefs: parseDietPrefs(m.dietPreferences) })), ...(req.diet ? [{ who: "this request", prefs: { rules: parseDietPrefs(req.diet).rules, avoid: [] as string[] } }] : [])].filter((d) => d.prefs.rules.length || d.prefs.avoid.length);
  const skippedForDiet: string[] = [];
  if (!all.length) return { request: req, meals: [], totalKnownCostCents: 0, unpriced: [], warnings: ["Your recipe library is empty. Add or import recipes first — HomeOS only plans with recipes you have saved."], occupied: [] };
  const stock = await pantryByFood();
  const existing = await prisma.mealPlanItem.findMany({ where: { date: { gte: req.startDate, lte: addDays(req.startDate, req.days - 1) } } });
  const occupied = new Set(existing.map((e) => `${e.date}|${e.slot}`));

  // Pre-score each recipe once against current pantry and recorded prices.
  const scored = [] as { r: (typeof all)[number]; coverage: number; missing: string[]; cost: number; unpriced: string[]; terms: string }[];
  for (const r of all) {
    const terms = recipeTerms(r);
    if (req.exclude.some((x) => terms.includes(x))) continue;
    const clash = dietSets.map((d) => ({ who: d.who, v: recipeViolations(r.ingredients, d.prefs) })).find((x) => x.v.length);
    if (clash) { skippedForDiet.push(`${r.name} (${clash.who}: ${clash.v[0].reason.toLowerCase()} — ${clash.v[0].ingredient})`); continue; }
    const check = await checkRecipeAgainstPantry(r.id, req.servings ?? r.servings, stock);
    let cost = 0;
    const unpriced: string[] = [];
    for (const c of check.checks.filter((c) => c.status !== "have" && !c.optional)) {
      const ing = r.ingredients.find((i) => i.name === c.name);
      const est = c.required !== null ? await estimatePrice(ing?.foodItem ?? null, c.missing || c.required, c.unit) : null;
      if (est) cost += est.cents; else unpriced.push(c.name);
    }
    scored.push({ r, coverage: check.coverage, missing: check.checks.filter((c) => c.status !== "have" && !c.optional).map((c) => c.name), cost, unpriced, terms });
  }
  const meals: ProposedMeal[] = [];
  const termCount: Record<string, number> = {};
  const used = new Map<string, number>();
  let spent = 0;
  for (let d = 0; d < req.days; d++) {
    const date = addDays(req.startDate, d);
    for (const slot of req.slots) {
      if (occupied.has(`${date}|${slot}`)) continue;
      const pool = scored.filter((s) => (slotCats[slot] ?? ["main"]).includes(s.r.category));
      const candidates = (pool.length ? pool : scored).filter((s) => Object.entries(req.maxRepeats).every(([term, max]) => !s.terms.includes(term) || (termCount[term] ?? 0) < max));
      if (!candidates.length) { warnings.push(`No recipe fits the constraints for ${weekdayName(weekday(date))} ${slot.toLowerCase()}.`); continue; }
      const ranked = candidates
        .map((s) => {
          const repeats = used.get(s.r.id) ?? 0;
          const overBudget = req.budgetCents !== null && spent + s.cost > req.budgetCents;
          const score = (req.preferPantry ? s.coverage * 6 : s.coverage * 2) - repeats * 5 - s.cost / 1500 + (s.r.favourite ? 0.6 : 0) - (overBudget ? 50 : 0) - s.unpriced.length * 0.2;
          return { s, score, overBudget };
        })
        .sort((a, b) => b.score - a.score);
      const pick = ranked[0];
      if (pick.overBudget) warnings.push(`Budget would be exceeded by ${weekdayName(weekday(date))} ${slot.toLowerCase()} — consider fewer planned meals or cheaper recipes.`);
      used.set(pick.s.r.id, (used.get(pick.s.r.id) ?? 0) + 1);
      for (const term of Object.keys(req.maxRepeats)) if (pick.s.terms.includes(term)) termCount[term] = (termCount[term] ?? 0) + 1;
      spent += pick.s.cost;
      meals.push({ date, slot, recipeId: pick.s.r.id, title: pick.s.r.name, coverage: pick.s.coverage, missing: pick.s.missing, estCostCents: pick.s.cost, unpricedItems: pick.s.unpriced });
    }
  }
  if (dietSets.length) warnings.unshift(`Following diets: ${dietSets.map((d) => `${d.who === "this request" ? "requested" : d.who} — ${describeDiet(d.prefs).join(", ")}`).join("; ")}.`);
  if (skippedForDiet.length) warnings.push(`Skipped ${skippedForDiet.length} recipe(s) that don't fit: ${skippedForDiet.slice(0, 5).join("; ")}${skippedForDiet.length > 5 ? "…" : ""}. Say “ignore diets” to include them, or adapt them (recipe → Adapt).`);
  if (new Set(meals.map((m) => m.recipeId)).size < meals.length) warnings.push(`Your library has ${all.length} recipe(s), so some meals repeat. Add more recipes for more variety.`);
  const unpriced = [...new Set(meals.flatMap((m) => m.unpricedItems))];
  if (unpriced.length) warnings.push(`No recorded price for: ${unpriced.slice(0, 8).join(", ")}${unpriced.length > 8 ? "…" : ""}. The cost estimate excludes them.`);
  if (existing.length) warnings.push(`${existing.length} slot(s) already planned were left unchanged.`);
  return { request: req, meals, totalKnownCostCents: spent, unpriced, warnings, occupied: [...occupied] };
}
