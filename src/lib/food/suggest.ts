// The kitchen assistant's proactive side: when food comes in, suggest what to make with it, and
// suggest what to eat next from the person's own targets and today's log. Deterministic and grounded
// in recorded data: saved recipes, pantry stock, nutrition targets, diet & allergy preferences.
import { prisma } from "../db";
import { today, addDays } from "../dates";
import { listRecipes } from "./recipes";
import { pantryByFood, availabilityFrom } from "./pantry";
import { loadFoodIndex, matchFood } from "./catalog";
import { currentTargets } from "./targets";
import { parseDietPrefs, recipeViolations } from "./diet";
import { normalizeName, singular } from "../utils";
import type { Viewer } from "../auth/session";
import { isFreeStaple } from "./staples";

// Breads, sauces, sweets and drinks go with a meal; they aren't "what to eat next".
const NOT_A_MEAL = /\b(bread|focaccia|ciabatta|naan|roti|chapati|paratha|tortilla|bun|rolls?|sauce|dressing|dip|chutney|pickle|jam|cookies?|biscuits?|cake|brownies?|muffins?|dessert|ice cream|syrup|drink|smoothie|tea|coffee|marinade|spice mix|masala powder)(?:e?s)?\b/i;

// Classic, widely-known uses for staples — "with" lists the other usual ingredients so the
// suggestion can say which of them you already have.
const IDEAS: { match: RegExp; ideas: { title: string; with: string[] }[] }[] = [
  { match: /\b(flour|maida|atta)\b/, ideas: [
    { title: "Pancakes", with: ["milk", "egg", "sugar", "butter"] }, { title: "Flatbreads / rotis", with: ["water", "salt", "oil"] },
    { title: "Banana bread", with: ["banana", "egg", "sugar", "butter"] }, { title: "Pizza dough", with: ["yeast", "olive oil", "salt"] },
    { title: "White sauce (for pasta or bakes)", with: ["butter", "milk"] }, { title: "Crêpes", with: ["milk", "egg", "butter"] } ] },
  { match: /\brice\b/, ideas: [{ title: "Egg fried rice", with: ["egg", "soy sauce", "spring onion"] }, { title: "Vegetable pulao", with: ["onion", "carrot", "peas"] }, { title: "Rice pudding / kheer", with: ["milk", "sugar"] }] },
  { match: /\beggs?\b/, ideas: [{ title: "Shakshuka", with: ["tomato", "onion", "bell pepper"] }, { title: "Vegetable omelette", with: ["onion", "spinach", "cheese"] }, { title: "Egg bhurji", with: ["onion", "tomato", "green chilli"] }] },
  { match: /\bchicken\b/, ideas: [{ title: "Chicken stir-fry", with: ["soy sauce", "garlic", "bell pepper"] }, { title: "Chicken curry", with: ["onion", "tomato", "yogurt"] }, { title: "Sheet-pan roast chicken & veg", with: ["potato", "carrot", "olive oil"] }] },
  { match: /\b(spinach|palak)\b/, ideas: [{ title: "Palak dal or saag", with: ["lentils", "onion", "garlic"] }, { title: "Spinach & feta omelette", with: ["egg", "feta"] }, { title: "Creamy spinach pasta", with: ["pasta", "garlic", "cream"] }] },
  { match: /\btomato(es)?\b/, ideas: [{ title: "Quick tomato pasta sauce", with: ["garlic", "olive oil", "basil"] }, { title: "Tomato soup", with: ["onion", "garlic", "stock"] }] },
  { match: /\bpotato(es)?\b/, ideas: [{ title: "Aloo sabzi", with: ["onion", "cumin seeds", "turmeric"] }, { title: "Crispy roast potatoes", with: ["olive oil", "garlic"] }, { title: "Potato soup", with: ["onion", "milk", "stock"] }] },
  { match: /\b(pasta|spaghetti|penne)\b/, ideas: [{ title: "Aglio e olio", with: ["garlic", "olive oil", "chilli"] }, { title: "Pasta salad", with: ["tomato", "cucumber", "feta"] }] },
  { match: /\boats?\b/, ideas: [{ title: "Overnight oats", with: ["milk", "yogurt", "banana"] }, { title: "Oat cookies", with: ["butter", "sugar", "egg"] }] },
  { match: /\bbananas?\b/, ideas: [{ title: "Banana smoothie", with: ["milk", "yogurt", "oats"] }, { title: "Banana bread", with: ["flour", "egg", "sugar", "butter"] }] },
  { match: /\b(yogh?urt|curd)\b/, ideas: [{ title: "Raita", with: ["cucumber", "cumin seeds"] }, { title: "Yogurt marinade for chicken", with: ["chicken", "garlic", "ginger"] }] },
  { match: /\b(lentils?|dal|daal|moong|masoor|toor)\b/, ideas: [{ title: "Dal tadka", with: ["onion", "tomato", "garlic", "cumin seeds"] }, { title: "Lentil soup", with: ["carrot", "onion", "stock"] }] },
  { match: /\b(chickpeas?|chana|garbanzo)\b/, ideas: [{ title: "Chana masala", with: ["onion", "tomato", "ginger"] }, { title: "Hummus", with: ["tahini", "lemon", "garlic"] }] },
  { match: /\bbread\b/, ideas: [{ title: "French toast", with: ["egg", "milk", "cinnamon"] }, { title: "Grilled cheese sandwich", with: ["cheese", "butter"] }] },
  { match: /\bpaneer\b/, ideas: [{ title: "Paneer bhurji", with: ["onion", "tomato", "green chilli"] }, { title: "Palak paneer", with: ["spinach", "onion", "cream"] }] },
  { match: /\b(soy sauce|hoisin|oyster sauce)\b/, ideas: [{ title: "Vegetable stir-fry noodles", with: ["noodles", "garlic", "bell pepper"] }, { title: "Sticky glazed chicken", with: ["chicken", "garlic", "honey"] }] },
  { match: /\bmushrooms?\b/, ideas: [{ title: "Garlic mushrooms on toast", with: ["bread", "garlic", "butter"] }, { title: "Mushroom stir-fry", with: ["soy sauce", "garlic"] }] },
  { match: /\btofu\b/, ideas: [{ title: "Tofu scramble", with: ["onion", "turmeric", "spinach"] }, { title: "Crispy tofu stir-fry", with: ["soy sauce", "garlic", "bell pepper"] }] },
  { match: /\bavocados?\b/, ideas: [{ title: "Guacamole", with: ["lime", "onion", "tomato"] }, { title: "Avocado toast", with: ["bread", "lemon"] }] },
  { match: /\bcheese\b/, ideas: [{ title: "Quesadillas", with: ["tortilla", "bell pepper", "onion"] }, { title: "Mac and cheese", with: ["pasta", "milk", "butter"] }] },
  { match: /\bmilk\b/, ideas: [{ title: "Masala chai", with: ["tea", "ginger", "sugar"] }, { title: "Porridge", with: ["oats", "banana"] }] },
];

export interface Suggestions {
  forNames: string[];
  useIt: { id: string; name: string; coverage: number; missing: string[]; uses: string[]; favourite: boolean }[];
  ideas: { title: string; uses: string; have: string[]; need: string[] }[];
  next: {
    remaining: { kcal: number; protein: number } | null;
    eaten: { kcal: number; protein: number };
    picks: { id: string; name: string; kcal: number; protein: number; canCook: boolean; reason: string }[];
    note: string | null;
  };
}

const key = (s: string) => normalizeName(s).split(" ").map(singular).join(" ");

/** What was bought or added in the last few days (pantry additions). */
export async function recentAdditions(days = 3) {
  const since = new Date(Date.now() - days * 86400_000);
  const tx = await prisma.inventoryTransaction.findMany({ where: { delta: { gt: 0 }, createdAt: { gte: since }, reason: { in: ["PURCHASE", "RECEIPT", "SHOPPING", "ADJUST"] } }, orderBy: { createdAt: "desc" }, take: 40 });
  const seen = new Set<string>();
  return tx.filter((t) => { const k = key(t.name); if (seen.has(k)) return false; seen.add(k); return true; }).map((t) => t.name).slice(0, 8);
}

function slotNow(hour: number) {
  return hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 18 ? "snack" : "dinner";
}

export async function kitchenSuggestions(viewer: Pick<Viewer, "profileId">, names?: string[], now = new Date()): Promise<Suggestions> {
  const forNames = (names?.length ? names : await recentAdditions()).filter(Boolean);
  const [index, recipes, stock, profile] = await Promise.all([
    loadFoodIndex(), listRecipes(), pantryByFood(),
    prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId }, select: { dietPreferences: true, name: true } }),
  ]);
  const prefs = parseDietPrefs(profile.dietPreferences);
  const allowed = recipes.filter((r) => !recipeViolations(r.ingredients, prefs).length);

  const pantryNames = new Set<string>();
  for (const items of stock.values()) for (const it of items) { pantryNames.add(key(it.name)); if (it.foodItem) pantryNames.add(key(it.foodItem.name)); }
  const inPantry = (n: string) => { const k = key(n); return [...pantryNames].some((p) => p === k || p.includes(k) || k.includes(p)); };

  const coverageOf = (r: (typeof recipes)[number]) => {
    const essential = r.ingredients.filter((i) => !i.optional);
    const missing: string[] = [];
    for (const ing of essential) {
      if (isFreeStaple(ing.name)) continue;
      const items = (ing.foodItemId && stock.get(ing.foodItemId)) || [];
      if (ing.quantity === null) { if (!items.length) missing.push(ing.name); continue; }
      const avail = availabilityFrom(items, ing.foodItem ?? { gramsPerMl: null, gramsPerEach: null }, ing.unit);
      if (avail.quantity + 1e-9 < ing.quantity) missing.push(ing.name);
    }
    return { coverage: essential.length ? (essential.length - missing.length) / essential.length : 0, missing };
  };

  // 1. Saved recipes that use what just came in.
  const foodIds = new Set(forNames.map((n) => matchFood(index, n)?.id).filter((x): x is string => Boolean(x)));
  const keys = forNames.map(key);
  const useIt = allowed
    .map((r) => {
      const uses = r.ingredients.filter((i) => (i.foodItemId && foodIds.has(i.foodItemId)) || keys.some((k) => key(i.name).includes(k) || k.includes(key(i.name)))).map((i) => i.foodItem?.name ?? i.name);
      return uses.length ? { id: r.id, name: r.name, favourite: r.favourite, uses: [...new Set(uses)], ...coverageOf(r) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.coverage - a.coverage || Number(b.favourite) - Number(a.favourite))
    .slice(0, 4);

  // 2. New ideas for those ingredients (skipping ones already saved as recipes).
  const saved = new Set(recipes.map((r) => key(r.name)));
  const ideas: Suggestions["ideas"] = [];
  for (const n of forNames) {
    const lower = n.toLowerCase();
    for (const group of IDEAS) {
      if (!group.match.test(lower)) continue;
      for (const idea of group.ideas) {
        if (ideas.length >= 4 || ideas.some((x) => x.title === idea.title) || saved.has(key(idea.title))) continue;
        const prefsBlock = recipeViolations([{ name: n }, ...idea.with.map((w) => ({ name: w }))], prefs).length > 0;
        if (prefsBlock) continue;
        ideas.push({ title: idea.title, uses: n, have: idea.with.filter(inPantry), need: idea.with.filter((w) => !inPantry(w)) });
      }
    }
  }
  ideas.sort((a, b) => b.have.length / (b.have.length + b.need.length) - a.have.length / (a.have.length + a.need.length));

  // 3. What to eat next, from the person's targets and today's log.
  const d = today();
  const [target, log] = await Promise.all([currentTargets(viewer.profileId, d), prisma.foodLog.findUnique({ where: { profileId_date: { profileId: viewer.profileId, date: d } }, include: { items: true } })]);
  const eaten = { kcal: Math.round(log?.items.reduce((a, i) => a + i.kcal, 0) ?? 0), protein: Math.round(log?.items.reduce((a, i) => a + i.protein, 0) ?? 0) };
  const remaining = target ? { kcal: Math.max(0, Math.round(target.kcal - eaten.kcal)), protein: Math.max(0, Math.round(target.protein - eaten.protein)) } : null;
  const slot = slotNow(now.getHours());
  const recent = new Set((await prisma.foodLogItem.findMany({ where: { foodLog: { profileId: viewer.profileId, date: { gte: addDays(d, -2) } }, recipeId: { not: null } }, select: { recipeId: true } })).map((x) => x.recipeId));
  let note: string | null = null;
  const withNutrition = allowed.filter((r) => r.nutrition.coverage >= 0.7 && r.nutrition.perServing.kcal > 0 && !["dessert", "drink", "sauce", "side"].includes(r.category) && !NOT_A_MEAL.test(r.name));
  if (!target) note = "Set a calorie & protein target on your profile (People) and HomeOS will suggest meals that fit what you have left today.";
  else if (!withNutrition.length) note = "Once your saved recipes have nutrition (most ingredients now match automatically), HomeOS can pick meals that fit your targets.";
  else if (remaining && remaining.kcal < 150) note = `You've reached today's ${Math.round(target.kcal)} kcal target.`;
  const picks = !target || !remaining || remaining.kcal < 150 ? [] : withNutrition
    .map((r) => {
      const ps = r.nutrition.perServing;
      const cov = coverageOf(r);
      const canCook = cov.missing.length === 0;
      const proteinGap = remaining.protein / Math.max(1, target.protein);
      let score = 0;
      score += canCook ? 40 : cov.coverage * 20;
      score += ps.kcal <= remaining.kcal ? 20 : -Math.min(40, (ps.kcal - remaining.kcal) / 15);
      score += proteinGap > 0.3 ? Math.min(30, (ps.protein / Math.max(1, ps.kcal)) * 400) : 0;
      if (r.category === "breakfast" && slot === "breakfast") score += 10;
      if (r.category !== "breakfast" && slot !== "breakfast") score += 5;
      if (recent.has(r.id)) score -= 15;
      if (r.favourite) score += 4;
      const bits = [`${Math.round(ps.kcal)} kcal, ${Math.round(ps.protein)} g protein a serving`];
      bits.push(ps.kcal <= remaining.kcal ? `fits the ${remaining.kcal} kcal you have left` : `a bit over the ${remaining.kcal} kcal left`);
      if (proteinGap > 0.3 && ps.protein >= 20) bits.push(`helps with the ${remaining.protein} g protein still to go`);
      bits.push(canCook ? "you have everything" : `${cov.missing.length} to buy`);
      return { id: r.id, name: r.name, kcal: Math.round(ps.kcal), protein: Math.round(ps.protein), canCook, reason: bits.join(" · "), score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _s, ...p }) => { void _s; return p; });

  const picked = new Set(picks.map((p) => p.id));
  return { forNames, useIt: useIt.filter((r) => !picked.has(r.id)), ideas, next: { remaining, eaten, picks, note } };
}
