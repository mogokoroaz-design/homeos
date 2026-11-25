// Diet rules from plain text ("vegetarian, no shellfish, allergic to peanuts") and ingredient
// checks used by the meal planner and the recipe adapter. Keyword-based and deliberately
// conservative: it flags likely conflicts; product labels remain the source of truth.

export type DietRule =
  | "vegetarian" | "vegan" | "pescatarian" | "gluten-free" | "dairy-free" | "egg-free" | "nut-free"
  | "no-pork" | "no-beef" | "no-shellfish" | "no-fish" | "low-carb";

export const DIET_LABELS: Record<DietRule, string> = {
  vegetarian: "Vegetarian", vegan: "Vegan", pescatarian: "Pescatarian", "gluten-free": "Gluten-free", "dairy-free": "Dairy-free",
  "egg-free": "Egg-free", "nut-free": "Nut-free", "no-pork": "No pork", "no-beef": "No beef", "no-shellfish": "No shellfish", "no-fish": "No fish", "low-carb": "Low-carb",
};

const W = (words: string[]) => new RegExp(`\\b(${words.join("|")})`, "i");
export const GROUPS = {
  meat: W(["chicken", "beef", "pork", "lamb", "mutton", "goat", "turkey", "duck", "bacon", "ham", "sausage", "salami", "pepperoni", "chorizo", "prosciutto", "pancetta", "mince", "steak", "veal", "venison", "meatball", "gelatin", "lard", "chicken stock", "beef stock", "bone broth"]),
  pork: W(["pork", "bacon", "ham", "sausage", "salami", "pepperoni", "chorizo", "prosciutto", "pancetta", "lard"]),
  beef: W(["beef", "steak", "veal", "brisket", "ground beef", "beef mince", "oxtail"]),
  fish: W(["fish", "salmon", "tuna", "cod", "haddock", "tilapia", "trout", "sardine", "anchov", "mackerel", "halibut", "sea bass", "fish sauce"]),
  shellfish: W(["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop", "squid", "calamari", "crayfish", "langoustine"]),
  dairy: W(["milk", "butter", "cream", "cheese", "yogurt", "yoghurt", "ghee", "paneer", "ricotta", "mozzarella", "parmesan", "cheddar", "feta", "buttermilk", "whey", "custard", "mascarpone", "condensed milk"]),
  egg: W(["eggs?", "egg yolk", "egg white", "mayonnaise", "mayo", "meringue"]),
  gluten: W(["flour", "wheat", "bread", "breadcrumb", "panko", "pasta", "spaghetti", "noodle", "couscous", "barley", "rye", "semolina", "bulgur", "seitan", "soy sauce", "beer", "tortilla", "pita", "cracker", "biscuit", "cake", "pastry", "puff pastry", "oats?", "farro", "spelt", "orzo", "lasagn", "macaroni", "penne", "fettuccine", "noodles"]),
  nuts: W(["almond", "walnut", "cashew", "peanut", "pecan", "hazelnut", "pistachio", "macadamia", "brazil nut", "pine nut", "nut butter", "praline", "marzipan"]),
  carbs: W(["sugar", "rice", "pasta", "bread", "potato", "flour", "noodle", "tortilla", "honey", "maple syrup", "oats?"]),
  honey: W(["honey"]),
};
// Ingredients whose name contains a "free" alternative don't count ("gluten-free pasta", "vegan butter").
const SAFE = /\b(gluten[- ]free|dairy[- ]free|vegan|plant[- ]based|egg[- ]free|nut[- ]free|non[- ]dairy|coconut milk|oat milk|soy milk|almond milk|rice milk|flax egg|tofu|tempeh|vegetable stock|coconut cream|nutritional yeast|tamari|cauliflower rice|zucchini noodles)\b/i;
// Some words are ingredients that only look like a group ("cream of tartar", "peanut-free", "butternut").
const FALSE_POSITIVE = /\b(butternut|coconut cream|coconut milk|nutmeg|egg ?plant|eggplant|rice vinegar|peanut-free|nut-free|dairy-free|egg-free)\b/gi;

const RULE_GROUPS: Record<DietRule, (keyof typeof GROUPS)[]> = {
  vegetarian: ["meat", "fish", "shellfish"], vegan: ["meat", "fish", "shellfish", "dairy", "egg", "honey"], pescatarian: ["meat"],
  "gluten-free": ["gluten"], "dairy-free": ["dairy"], "egg-free": ["egg"], "nut-free": ["nuts"], "no-pork": ["pork"], "no-beef": ["beef"],
  "no-shellfish": ["shellfish"], "no-fish": ["fish"], "low-carb": ["carbs"],
};

export interface DietPrefs { rules: DietRule[]; avoid: string[] }

/** Parses free-text preferences such as "vegetarian, no shellfish, allergic to peanuts, avoid mushrooms". */
export function parseDietPrefs(text: string | null | undefined): DietPrefs {
  const t = (text ?? "").toLowerCase();
  const rules = new Set<DietRule>();
  if (/\bvegan\b|plant[- ]based/.test(t)) rules.add("vegan");
  if (/\bvegetarian\b|\bveggie\b|no meat|meat[- ]free/.test(t)) rules.add("vegetarian");
  if (/pescatarian|pescetarian/.test(t)) rules.add("pescatarian");
  if (/gluten|coeliac|celiac/.test(t)) rules.add("gluten-free");
  if (/dairy|lactose/.test(t)) rules.add("dairy-free");
  if (/(no|free|allerg\w*( to)?|avoid)\s*eggs?\b|egg[- ]free/.test(t)) rules.add("egg-free");
  if (/\bnuts?\b|peanut|tree nut/.test(t)) rules.add("nut-free");
  if (/(no|avoid|don'?t eat|halal|kosher)\s*pork|\bhalal\b|\bkosher\b/.test(t)) rules.add("no-pork");
  if (/(no|avoid|don'?t eat)\s*beef|\bhindu\b/.test(t)) rules.add("no-beef");
  if (/shellfish|seafood allerg|no seafood/.test(t)) rules.add("no-shellfish");
  if (/(no|avoid|don'?t eat)\s*fish\b|no seafood/.test(t)) rules.add("no-fish");
  if (/low[- ]carb|\bketo\b/.test(t)) rules.add("low-carb");
  const known = /^(pork|beef|fish|shellfish|seafood|meat|dairy|lactose|gluten|eggs?|nuts?|peanuts?|tree nuts?)$/;
  const avoid = [...t.matchAll(/(?:\bno\b|avoid|allergic to|allergy to|don'?t (?:eat|like)|hate|without)\s+([a-z][a-z \-]{1,30}?)(?=,|;|\.|\band\b|$)/g)]
    .map((m) => m[1].trim().replace(/s$/, ""))
    .filter((w) => w && !known.test(w) && !known.test(`${w}s`));
  return { rules: [...rules], avoid: [...new Set(avoid)] };
}

export function describeDiet(p: DietPrefs) {
  return [...p.rules.map((r) => DIET_LABELS[r]), ...p.avoid.map((a) => `No ${a}`)];
}

// Exceptions that only apply to one group ("peanut butter" is not dairy, but it is nuts).
const GROUP_EXCEPTIONS: Partial<Record<keyof typeof GROUPS, RegExp>> = {
  dairy: /\b(peanut|almond|cashew|sunflower|nut|seed|apple|cocoa|shea) butter\b|\bbutter (beans?|lettuce|squash)\b|\bcream of tartar\b/gi,
  gluten: /\b(gluten[- ]free \w+|rice noodles?|rice flour|corn tortillas?|buckwheat|oat milk)\b/gi,
};

function hits(name: string, group: keyof typeof GROUPS) {
  const exc = GROUP_EXCEPTIONS[group];
  let cleaned = name.replace(FALSE_POSITIVE, " ");
  if (exc) cleaned = cleaned.replace(exc, " ");
  if (group !== "nuts" && SAFE.test(cleaned)) return false;
  return GROUPS[group].test(cleaned);
}

export interface Violation { ingredient: string; reason: string }

/** Which ingredients break the given preferences. Optional ingredients are ignored (they can be left out). */
export function recipeViolations(ingredients: { name: string; optional?: boolean }[], prefs: DietPrefs): Violation[] {
  const out: Violation[] = [];
  for (const ing of ingredients) {
    if (ing.optional) continue;
    for (const rule of prefs.rules) {
      if (rule === "low-carb") continue; // low-carb is a preference, not an exclusion
      if (RULE_GROUPS[rule].some((g) => hits(ing.name, g))) { out.push({ ingredient: ing.name, reason: DIET_LABELS[rule] }); break; }
    }
    for (const a of prefs.avoid) {
      if (new RegExp(`\\b${a.replace(/[^a-z ]/g, "")}`, "i").test(ing.name) && !out.some((o) => o.ingredient === ing.name)) out.push({ ingredient: ing.name, reason: `No ${a}` });
    }
  }
  return out;
}

/** Labels a recipe as suitable for common diets (heuristic, shown as hints). */
export function dietBadges(ingredients: { name: string; optional?: boolean }[]) {
  const req = ingredients.filter((i) => !i.optional);
  const any = (g: keyof typeof GROUPS) => req.some((i) => hits(i.name, g));
  const badges: DietRule[] = [];
  if (!any("meat") && !any("fish") && !any("shellfish")) badges.push(any("dairy") || any("egg") || any("honey") ? "vegetarian" : "vegan");
  if (!any("gluten")) badges.push("gluten-free");
  if (!any("dairy")) badges.push("dairy-free");
  if (!any("nuts")) badges.push("nut-free");
  return badges;
}
