// Turns what someone says while cooking into recipe parts and shopping-list requests.
// Deterministic rules — no AI needed. Everything lands in a reviewable draft; only an explicit
// "add … to the shopping list" request writes anything (the shopping list) during cooking.
import { parseIngredientLine } from "./parse";

export type DictationKind = "ingredient" | "step" | "shopping" | "note" | "name" | "servings" | "ignore";

export interface DictationEntry {
  id: string;
  at: number; // seconds since cooking started
  text: string; // what was heard (cleaned)
  kind: DictationKind;
  ingredients?: { name: string; quantity: number | null; unit: string; note: string }[];
  shopping?: string[];
  value?: string; // name / note text / servings number
}

const NUM_WORDS: Record<string, string> = {
  a: "1", an: "1", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100",
  half: "1/2", quarter: "1/4", couple: "2", few: "3", dozen: "12",
};
const UNIT_WORD = "(?:cups?|tablespoons?|teaspoons?|tbsp|tsp|grams?|kilos?|kilograms?|g|kg|ml|millilit(?:er|re)s?|lit(?:er|re)s?|l|ounces?|oz|pounds?|lbs?|pinch(?:es)?|cloves?|cans?|bunch(?:es)?|handfuls?|pieces?|slices?|sticks?|dash(?:es)?|sprigs?|inch(?:es)?)";

/** "two and a half cups" → "2.5 cups", "half a cup of" → "1/2 cup of", "a pinch of" → "1 pinch of". */
export function spokenNumbers(s: string): string {
  let t = ` ${s.toLowerCase()} `;
  t = t.replace(/\b(\w+) and a half\b/g, (m, n) => (NUM_WORDS[n] && !/[/]/.test(NUM_WORDS[n]) ? `${Number(NUM_WORDS[n]) + 0.5}` : m));
  t = t.replace(/\bhalf an? /g, "1/2 ").replace(/\ba quarter( of)? an? /g, "1/4 ").replace(/\ba couple of /g, "2 ").replace(/\ba few /g, "3 ");
  t = t.replace(new RegExp(`\\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|half|quarter)\\s+(${UNIT_WORD})\\b`, "g"), (_, n, u) => `${NUM_WORDS[n]} ${u}`);
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?=\s)/g, (n) => NUM_WORDS[n]);
  return t.replace(/\s+/g, " ").trim();
}

const FILLER = /^(ok(ay)?|so|um+|uh+|right|now|and then|and|then|alright|next(?! time))[,\s]+/i;
function clean(s: string) {
  let t = s.trim().replace(/\s+/g, " ");
  for (let i = 0; i < 3; i++) t = t.replace(FILLER, "");
  return t.replace(/[.!?]+$/, "");
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function splitList(s: string): string[] {
  return s.split(/\s*(?:,|\band also\b|\band\b|\bplus\b)\s*/i).map((x) => x.replace(/^(some|more|a few|a|an|the)\s+/i, "").trim()).filter((x) => x.length > 1);
}

const HAS_QTY = new RegExp(`^(\\d+(?:[.,]\\d+)?|\\d+/\\d+)\\s*(${UNIT_WORD}\\b)?`, "i");

function ingredientsFrom(s: string) {
  // "2 tbsp soy sauce and 1 tbsp sugar" → two ingredients; "salt and pepper" → two without quantity
  const parts = s.split(/\s*(?:,|\band\b|\bplus\b)\s*(?=\d|\b(?:salt|pepper)\b)/i).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    const r = parseIngredientLine(p.replace(/^(some|the)\s+/i, ""));
    return { name: r.name.replace(/\s+(to taste|in|into the pan|to the pan|to it)$/i, ""), quantity: r.quantity, unit: r.quantity === null ? "" : r.unit, note: r.note };
  }).filter((i) => i.name && i.name.split(" ").length <= 5);
}

let n = 0;
const uid = () => `d${Date.now().toString(36)}${(n++).toString(36)}`;

/** Classifies one spoken sentence. */
export function classifyUtterance(raw: string, at = 0): DictationEntry {
  const text = clean(raw);
  const t = spokenNumbers(text);
  const base = { id: uid(), at, text: cap(text) };
  if (!t) return { ...base, kind: "ignore" };

  // Shopping list: "add milk to the shopping list", "we're out of eggs", "remind me to buy rice", "we need more soy sauce"
  const shop =
    t.match(/^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the|my|our)?\s*(?:shopping|grocery|groceries)(?: list)?$/) ||
    t.match(/^(?:shopping list|grocery list|groceries)[:,]?\s+(?:add\s+)?(.+)$/) ||
    t.match(/^(?:we(?:'re| are)|i'm|i am)\s+(?:almost\s+|nearly\s+)?(?:out of|running out of|running low on|low on)\s+(.+)$/) ||
    t.match(/^(?:remind me to |we need to |i need to |need to )?buy\s+(.+)$/) ||
    t.match(/^we need (?:more |some )?(.+?)(?: from the (?:shop|store))?$/);
  if (shop) return { ...base, kind: "shopping", shopping: splitList(shop[1]).map(cap) };

  const name = t.match(/^(?:this recipe is called|this is called|this is|call (?:it|this|the recipe)|recipe name(?: is)?|the name is|name (?:it|this)|title(?: is)?)[:,]?\s+(.+)$/);
  if (name && !/^(done|ready|good|great|cooked|perfect|it)\b/.test(name[1])) return { ...base, kind: "name", value: name[1].replace(/^(a|the)\s+/, "").split(" ").map(cap).join(" ") };

  const serves = t.match(/^(?:it |this )?(?:serves|makes|feeds|for)\s+(\d+)(?:\s+(?:people|servings|portions|persons))?$/) || t.match(/^(\d+)\s+(?:servings|portions)$/);
  if (serves) return { ...base, kind: "servings", value: serves[1] };

  const note = text.match(/^(?:note|tip|remember|important)[:,]?\s+(.+)$/i) || text.match(/^(next time .+)$/i);
  if (note) return { ...base, kind: "note", value: cap(note[1]) };

  // Ingredient (also kept as a step): "add 2 tbsp soy sauce", "2 cloves of garlic", "ingredients: salt and pepper"
  const ing = t.match(/^(?:ingredients?[:,]?|add(?:ing)?|i(?:'m| am) adding|i added|put in|throw in|toss in|use|using|in goes|pour in)\s+(.+)$/);
  const body = ing ? ing[1] : HAS_QTY.test(t) ? t : null;
  if (body) {
    const quantified = HAS_QTY.test(body.replace(/^(some|the)\s+/, ""));
    const isList = /^ingredients?/.test(t);
    const short = body.split(" ").length <= 4 && !/\b(back|it|them|everything|together|mix|stir|until)\b/.test(body);
    if (quantified || isList || short) {
      const ingredients = ingredientsFrom(body);
      if (ingredients.length) return { ...base, kind: isList ? "ingredient" : "ingredient", ingredients, text: cap(text) };
    }
  }
  return { ...base, kind: "step" };
}

export interface DictatedRecipe {
  name: string; servings: number; cookMinutes: number | null;
  ingredients: { name: string; quantity: number | null; unit: string; note: string; optional: boolean }[];
  instructions: string; notes: string; tags: string;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Builds a recipe draft from the captured entries. Ingredient sentences also become steps ("Add 2 tbsp soy sauce"). */
export function buildRecipeFromDictation(entries: DictationEntry[], elapsedSeconds: number): DictatedRecipe {
  const live = entries.filter((e) => e.kind !== "ignore");
  const name = [...live].reverse().find((e) => e.kind === "name")?.value ?? "";
  const servings = Number([...live].reverse().find((e) => e.kind === "servings")?.value) || 2;
  const ingMap = new Map<string, DictatedRecipe["ingredients"][number]>();
  for (const e of live) {
    if (e.kind !== "ingredient") continue;
    for (const i of e.ingredients ?? []) {
      const key = `${i.name.toLowerCase()}|${i.unit}`;
      const ex = ingMap.get(key);
      if (ex && ex.quantity !== null && i.quantity !== null) ex.quantity += i.quantity;
      else if (!ex) ingMap.set(key, { ...i, optional: false });
    }
  }
  const steps = live.filter((e) => e.kind === "step" || (e.kind === "ingredient" && !/^ingredients?\b/i.test(e.text))).map((e) => cap(e.text));
  const notes = live.filter((e) => e.kind === "note").map((e) => e.value!);
  const log = live.filter((e) => e.kind === "step" || e.kind === "ingredient").map((e) => `${mmss(e.at)}  ${e.text}`);
  const minutes = Math.round(elapsedSeconds / 60);
  return {
    name, servings,
    cookMinutes: minutes > 0 ? minutes : null,
    ingredients: [...ingMap.values()],
    instructions: steps.join("\n"),
    notes: [...notes, log.length ? `Dictated while cooking (${minutes} min):\n${log.join("\n")}` : ""].filter(Boolean).join("\n\n"),
    tags: "dictated",
  };
}

/** Hands-free controls during a cooking session. */
export function sessionCommand(raw: string): "pause" | "resume" | "finish" | "undo" | null {
  const t = clean(raw).toLowerCase();
  if (/^(pause|pause (the )?(timer|recording)|hold on|wait)$/.test(t)) return "pause";
  if (/^(resume|continue|carry on|start again|unpause|keep going)( (the )?(timer|recording))?$/.test(t)) return "resume";
  if (/^(finish|finish (the )?recipe|stop recording|done cooking|i'm done|we're done|that's it|end recipe|save (the )?recipe)$/.test(t)) return "finish";
  if (/^(undo|scratch that|delete that|remove that|cancel that|never mind|forget that)$/.test(t)) return "undo";
  return null;
}

/** Re-files an entry under another kind (the person corrected the guess). */
export function asKind(e: DictationEntry, kind: DictationKind): DictationEntry {
  const t = spokenNumbers(e.text);
  const strip = (s: string) => s.replace(/^(?:add(?:ing)?|i(?:'m| am) adding|i added|put in|throw in|use|using|ingredients?[:,]?)\s+/i, "");
  switch (kind) {
    case "ingredient": { const ingredients = ingredientsFrom(t.match(/(?:^|\s)(\d.*)$/)?.[1] ?? strip(t)); return { ...e, kind, ingredients: ingredients.length ? ingredients : [{ name: strip(e.text).toLowerCase(), quantity: null, unit: "", note: "" }] }; }
    case "shopping": return { ...e, kind, shopping: splitList(strip(e.text).replace(/\s+(to|on) the (shopping|grocery) list$/i, "")).map(cap) };
    case "name": return { ...e, kind, value: e.text.split(" ").map(cap).join(" ") };
    case "note": return { ...e, kind, value: e.text };
    case "servings": return { ...e, kind, value: String(Number(t.match(/\d+/)?.[0]) || 2) };
    default: return { ...e, kind };
  }
}
