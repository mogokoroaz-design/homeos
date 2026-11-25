// Deterministic parsers for ingredient lines, recipe text and conversational inventory input.
import { isKnownUnit, normalizeUnit, parseQuantity, dimensionOf } from "../units";

export interface ParsedIngredient {
  quantity: number | null;
  unit: string;
  name: string;
  note: string;
  optional: boolean;
  raw: string;
}

const SIZE_WORDS = /\b(large|medium|small|extra large|big|fresh|ripe|boneless|skinless|chopped|diced|minced|sliced|grated|finely|roughly|thinly|peeled|crushed|softened|melted|cooked|uncooked|frozen|thawed|organic|whole(?!\s+(?:wheat|grain|meal|milk|foods?|spelt|rye))|to taste|optional|divided)\b/gi;
const NUM = String.raw`(?:\d+\s*[¼½¾⅓⅔⅛]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|[¼½¾⅓⅔⅛⅕])`;
const NUMBER_WORDS: Record<string, number> = {
  "half a": 0.5, "half an": 0.5, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, "a dozen": 12, dozen: 12, couple: 2, "a couple of": 2, "a few": 3,
};

export function wordToNumber(w: string): number | null {
  const s = w.toLowerCase().trim();
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  return parseQuantity(s);
}

export function parseIngredientLine(rawLine: string): ParsedIngredient {
  rawLine = rawLine.replace(/^\s*[-•*▢☐□●◦·\u2022\u2023\u25E6\u2043]+\s*/, "");
  const trailing = rawLine.trim().match(/^([\p{L}][\p{L} '&-]{1,50}?)\s*[:\-–]?\s+(\d+(?:[.,]\d+)?|\d+\/\d+|[¼½¾])\s*(kg|g|mg|ml|l|lb|lbs|oz|tsp|tbsp|cups?|cloves?|pcs?)?\.?\s*(\(.*\))?$/iu);
  if (trailing && !/^\d/.test(rawLine.trim())) {
    return parseIngredientLine(`${trailing[2]}${trailing[3] ? ` ${trailing[3]}` : ""} ${trailing[1]}${trailing[4] ? ` ${trailing[4]}` : ""}`);
  }
  const raw = rawLine.trim();
  let s = raw.replace(/^[-•*▢☐□●◦·•]+\s*/, "").replace(/^\d+[.)]\s+(?=\D)/, "").trim();
  let optional = /\boptional\b/i.test(s);
  let note = "";
  // Parenthetical notes: "(about 250 g)" — package size inside "1 (14 oz) can" handled below.
  const pkg = s.match(new RegExp(`^(${NUM})\\s*\\((${NUM})\\s*([a-zA-Z. ]+?)\\)\\s*(can|cans|tin|tins|jar|jars|package|packages|pack|packs|bag|bags|box|boxes|bottle|bottles|carton|cartons)\\b\\s*(.*)$`, "i"));
  if (pkg) {
    const count = parseQuantity(pkg[1]) ?? 1;
    const size = parseQuantity(pkg[2]) ?? 0;
    const unit = normalizeUnit(pkg[3]);
    if (size > 0 && dimensionOf(unit) !== "other") {
      return finalize({ quantity: count * size, unit, name: pkg[5], note: `${pkg[1]} ${pkg[4]}`, optional, raw });
    }
  }
  const parens = s.match(/\(([^)]*)\)/g);
  if (parens) {
    note = parens.map((p) => p.slice(1, -1)).join("; ");
    s = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  }
  // Trailing comment after comma: "chicken thighs, boneless"
  const comma = s.indexOf(",");
  if (comma > 0) {
    note = [s.slice(comma + 1).trim(), note].filter(Boolean).join("; ");
    s = s.slice(0, comma).trim();
  }
  let quantity: number | null = null;
  let unit = "";
  const m = s.match(new RegExp(`^(${NUM})\\s*(.*)$`));
  if (m) {
    quantity = parseQuantity(m[1]);
    s = m[2].trim();
  } else {
    const w = s.match(/^(half an?|a couple of|a dozen|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|dozen)\s+(.*)$/i);
    if (w) {
      quantity = wordToNumber(w[1]);
      s = w[2].trim();
    }
  }
  // Unit: try two-word units first ("fl oz", "fluid ounces")
  const two = s.match(/^([a-zA-Z.]+\s+[a-zA-Z.]+)\s+(.*)$/);
  if (two && isKnownUnit(two[1]) && /fl|fluid/i.test(two[1])) {
    unit = normalizeUnit(two[1]);
    s = two[2];
  } else {
    const one = s.match(/^([a-zA-Z.]+)\b\.?\s*(?:of\s+)?(.*)$/);
    if (one && one[2] && isKnownUnit(one[1]) && !/^(x|t|c|each|whole|unit)$/i.test(one[1]) ) {
      unit = normalizeUnit(one[1]);
      s = one[2];
    } else if (one && quantity !== null && /^(c|t|T)$/.test(one[1]) && one[2]) {
      unit = one[1] === "T" ? "tbsp" : one[1] === "t" ? "tsp" : "cup";
      s = one[2];
    }
  }
  // "500g chicken" — number glued to unit
  if (quantity === null) {
    const glued = raw.match(/^(\d+(?:[.,]\d+)?)(kg|g|mg|ml|l|lb|lbs|oz)\b\s*(.*)$/i);
    if (glued) {
      quantity = Number(glued[1].replace(",", "."));
      unit = normalizeUnit(glued[2]);
      s = glued[3];
    }
  }
  s = s.replace(/^of\s+/i, "");
  if (/to taste|as needed|for serving|for garnish/i.test(raw)) optional = optional || quantity === null;
  return finalize({ quantity, unit: unit || (quantity !== null ? "each" : ""), name: s, note, optional, raw });
}

function finalize(p: ParsedIngredient): ParsedIngredient {
  const descriptors = (p.name.match(SIZE_WORDS) ?? []).map((x) => x.toLowerCase());
  let name = p.name.replace(SIZE_WORDS, " ").replace(/\b(and|or)\s*$/i, "").replace(/\s+/g, " ").trim();
  name = name.replace(/^[,;:\s-]+|[,;:\s-]+$/g, "");
  const note = [descriptors.filter((d) => d !== "optional" && d !== "to taste").join(" "), p.note].filter(Boolean).join("; ");
  return { ...p, name: name || p.name.trim(), note };
}

export interface ParsedRecipe {
  name: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  temperature: string;
  ingredients: ParsedIngredient[];
  instructions: string[];
  notes: string;
  warnings: string[];
}

// ── Caption / free-text cleaning ──

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×", rarr: "→" };

/** Decodes HTML entities in all forms: &amp; &#8212; &#x2014; (social platforms send captions this way). */
export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&([a-z][a-z0-9]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}
function safeCodePoint(n: number) {
  try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch { return ""; }
}

/**
 * Turns a social caption or pasted text into clean lines: decodes entities, converts keycap emoji
 * (1️⃣) to step numbers, normalises ℃/℉ and arrows, removes other emoji, hashtags and @mentions.
 */
export function cleanRecipeText(raw: string) {
  let s = decodeEntities(raw).replace(/\r/g, "");
  // Instagram og:description wrapper: `12K likes, 85 comments - user on May 3, 2025: "caption".`
  const wrapped = s.match(/^[\d.,]+[KkMm]? likes?, [\d.,]+[KkMm]? comments? - .{1,80}? on [^:]{3,40}: ["“]([\s\S]*)["”]\.?\s*$/);
  if (wrapped) s = wrapped[1];
  s = s
    .replace(/(\d{1,2})️?⃣/g, "\n$1. ") // keycap numbers → numbered lines
    .replace(/🔟/g, "\n10. ")
    .replace(/℃/g, "°C").replace(/℉/g, "°F")
    .replace(/\s*[→⇒➡➔►▶]️?\s*/g, " → ")
    .replace(/[　  -​]/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍|⃣|[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/(^|\s)@[\w.]+/g, "$1");
  return s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter((l) => l && !/^[\p{P}\p{S}\s]+$/u.test(l));
}

function headingKind(line: string): "ing" | "steps" | "notes" | null {
  const bare = line.replace(/[\p{P}\p{S}\d]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!bare || bare.split(" ").length > 4 || line.length > 40) return null;
  if (/^(ingredients?( list)?|you( will|ll)? need|what you( will|ll)? need|shopping list)$/.test(bare)) return "ing";
  if (/^(instructions?|method|directions?|steps?|preparation|prep|how to( make( it)?)?|recipe steps|cooking steps)$/.test(bare)) return "steps";
  if (/^(notes?|tips?|recipe notes|chef'?s? tips?|storage|substitutions?)$/.test(bare)) return "notes";
  return null;
}

const SIGN_OFF = /^(enjoy|bon app[eé]tit|happy (cooking|baking)|save (this|for later)|follow (me|for more)|link in bio|recipe below|full recipe)\b/i;

function minutesIn(s: string) {
  let total = 0;
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:-|–|to)?\s*(?:\d+\s*)?(h|hr|hrs|hours?|m|min|mins|minutes)\b/gi)) {
    total += Number(m[1].replace(",", ".")) * (/^h/i.test(m[2]) ? 60 : 1);
  }
  return total || null;
}

function labelledMinutes(text: string, label: RegExp) {
  const m = text.match(new RegExp(`(?:^|\\n|[,;|•·])\\s*(?:${label.source})\\s*(?:time)?\\s*[:\\-–]?\\s*(\\d+)\\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\\b(?:\\s*(\\d+)\\s*(m|min|mins|minutes))?`, "i"));
  if (!m) return null;
  let v = Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1);
  if (m[3]) v += Number(m[3]);
  return v;
}

export function looksLikeIngredient(line: string) {
  const p = parseIngredientLine(line);
  return p.quantity !== null && line.length < 120 && !/[.!?]$/.test(line.trim()) && !/^\d+[.)]\s/.test(line) && !/^(serves|servings|yield|makes|portions?|prep|cook|bake|total|time)\b/i.test(line.trim());
}

/** Parses free text (captions, transcripts, OCR, pasted web text) into a structured recipe draft. */
export function parseRecipeText(text: string, fallbackName = "Imported recipe"): ParsedRecipe {
  const warnings: string[] = [];
  const lines = cleanRecipeText(text);
  let section: "head" | "ing" | "steps" | "notes" = "head";
  let group = "";
  const ingredients: ParsedIngredient[] = [];
  const steps: string[] = [];
  const notes: string[] = [];
  const head: string[] = [];
  const seen = new Set<string>();
  const pushIng = (l: string) => {
    const key = l.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return; // captions sometimes repeat the list
    seen.add(key);
    const p = parseIngredientLine(l);
    ingredients.push(group ? { ...p, note: [p.note, `for ${group}`].filter(Boolean).join("; ") } : p);
  };
  for (const line of lines) {
    const kind = headingKind(line);
    if (kind) { section = kind; group = ""; continue; }
    if (SIGN_OFF.test(line)) continue;
    const isNumbered = /^(\d{1,2}[.)]\s*|step\s*\d+\s*[:.-]?\s*)/i.test(line);
    if (section === "head") {
      if (looksLikeIngredient(line)) { section = "ing"; pushIng(line); }
      else if (isNumbered && head.length) { section = "steps"; steps.push(cleanStep(line)); }
      else head.push(line);
    } else if (section === "ing") {
      // Sub-group headers such as "For the filling:"
      const g = line.match(/^(?:for )?((?:the )?[\p{L} ]{3,30}):$/iu);
      if (g && !looksLikeIngredient(line)) { group = g[1].trim().toLowerCase(); continue; }
      if (isNumbered && !looksLikeIngredient(line.replace(/^\d{1,2}[.)]\s*/, ""))) { section = "steps"; steps.push(cleanStep(line)); continue; }
      if (looksLikeIngredient(line) || (line.length < 60 && !/[.!?]$/.test(line))) pushIng(line.replace(/^[-•*▢☐]\s*/, ""));
      else notes.push(line);
    } else if (section === "steps") {
      // Unnumbered continuation lines join the previous step only when steps are numbered.
      if (!isNumbered && steps.length && line.length < 40 && !/[.!]$/.test(line)) notes.push(line);
      else steps.push(cleanStep(line));
    } else notes.push(line);
  }
  if (!steps.length && head.length > 1) steps.push(...head.slice(1).filter((l) => l.length > 25).map(cleanStep));
  const nameLine = head.find((l) => l.length > 2 && l.length < 90 && !/^(serves|servings|prep|cook|total|yield)/i.test(l) && !/https?:/.test(l)) ?? fallbackName;
  const joined = lines.join("\n");
  const servingsMatch = joined.match(/\b(?:serves|servings|yield|makes|portions?)\s*:?\s*(\d+)/i) ?? joined.match(/(\d+)\s*(?:servings|portions|people)\b/i);
  const temps = [...joined.matchAll(/(\d{2,3})\s*°\s*([CF])\b(?:\s*(?:\/|or|\()\s*(\d{2,3})\s*°\s*([CF]))?|(\d{3})\s*(?:degrees\s*(f|c|fahrenheit|celsius)?|°?\s*(?=[FC]\b)([FC]))/gi)];
  const t = temps[0];
  const temperature = !t ? "" : t[1] ? `${t[1]}°${t[2].toUpperCase()}${t[3] ? ` / ${t[3]}°${t[4].toUpperCase()}` : ""}` : `${t[5]}°${(t[6] ?? t[7] ?? "F")[0].toUpperCase()}`;
  const cookFromSteps = steps.filter((s) => /\b(bake|roast|cook|simmer|boil|fry|grill|air[- ]?fry|steam|broil|saut[eé])/i.test(s) && !/\b(chill|rest|cool|marinate|refrigerat|freeze|soak)/i.test(s)).map(minutesIn).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (!ingredients.length) warnings.push("No ingredient list was recognised — add ingredients manually.");
  if (!steps.length) warnings.push("No instructions were recognised.");
  if (!servingsMatch) warnings.push("Servings weren't stated — set them so portions and shopping scale correctly.");
  const unmatchedQty = ingredients.filter((i) => i.quantity === null && !i.optional).length;
  if (unmatchedQty) warnings.push(`${unmatchedQty} ingredient(s) have no quantity — please check.`);
  return {
    name: nameLine.replace(/^#+\s*/, "").replace(/[\s\p{P}]+$/u, "").trim().slice(0, 120) || fallbackName,
    servings: servingsMatch ? Number(servingsMatch[1]) : null,
    prepMinutes: labelledMinutes(joined, /prep(?:aration)?/),
    cookMinutes: labelledMinutes(joined, /cook(?:ing)?|bake|baking/) ?? (cookFromSteps || null),
    temperature,
    ingredients,
    instructions: steps,
    notes: notes.join("\n"),
    warnings,
  };
}

function cleanStep(line: string) {
  return line.replace(/^(\d{1,2}[.)]\s*|step\s*\d+\s*[:.-]?\s*|[-•*]\s*)/i, "").trim();
}

export interface ParsedInventoryChange {
  action: "ADD" | "CONSUME" | "WASTE" | "SET";
  quantity: number | null;
  unit: string;
  name: string;
  location: string | null;
  raw: string;
}

/** "We bought 2kg rice and 6 eggs", "used 200 g spinach", "add half a litre of milk to the fridge". */
export function parseInventoryText(text: string): ParsedInventoryChange[] {
  const lower = text.toLowerCase();
  let action: ParsedInventoryChange["action"] = "ADD";
  if (/\b(used|use|ate|eaten|cooked with|consumed|finished|took|removed|remove)\b/.test(lower)) action = "CONSUME";
  if (/\b(threw|thrown|throw|spoiled|went bad|expired|wasted|binned|discarded)\b/.test(lower)) action = "WASTE";
  if (/\b(we have|there (?:is|are)|only|left|remaining|set)\b/.test(lower) && !/\b(bought|add|got|picked up)\b/.test(lower)) action = "SET";
  const location = /\bfreezer\b/.test(lower) ? "FREEZER" : /\b(fridge|refrigerator)\b/.test(lower) ? "FRIDGE" : /\bpantry|cupboard\b/.test(lower) ? "PANTRY" : null;
  const body = text
    .replace(/^(please\s+)?(we|i)?\s*(just\s+)?(bought|got|picked up|added|add|used|use|ate|consumed|finished|threw out|threw away|have|still have|removed|remove)\s*/i, "")
    .replace(/\b(to|in|into|from|for)\s+the\s+(fridge|freezer|pantry|cupboard|refrigerator)\b/gi, "")
    .replace(/\b(today|yesterday|this morning|left|remaining|in stock)\b/gi, "")
    .replace(/[.!?]+$/, "");
  const parts = body.split(/,|;|\band\b|\bplus\b|\n/i).map((p) => p.trim()).filter(Boolean);
  const out: ParsedInventoryChange[] = [];
  for (const part of parts) {
    const ing = parseIngredientLine(part);
    if (!ing.name || ing.name.length < 2) continue;
    out.push({ action, quantity: ing.quantity, unit: ing.quantity === null ? "" : ing.unit || "each", name: ing.name.replace(/^(some|the|of)\s+/i, ""), location, raw: part });
  }
  return out;
}
