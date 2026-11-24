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

const SIZE_WORDS = /\b(large|medium|small|extra large|big|fresh|ripe|boneless|skinless|chopped|diced|minced|sliced|grated|finely|roughly|thinly|peeled|crushed|softened|melted|cooked|uncooked|frozen|thawed|organic|whole|to taste|optional|divided)\b/gi;
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

const ING_HEADER = /^(ingredients?|you(?:'ll)? need|what you need|shopping list)\s*:?\s*$/i;
const STEP_HEADER = /^(instructions?|method|directions?|steps?|preparation|how to make( it)?)\s*:?\s*$/i;
const NOTE_HEADER = /^(notes?|tips?)\s*:?\s*$/i;

function minutesFrom(text: string, label: RegExp) {
  const m = text.match(new RegExp(`(?:${label.source})[^\\n\\d]{0,20}(\\d+)\\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\\b(?:\\s*(\\d+)\\s*(m|min|mins|minutes))?`, "i"));
  if (!m) return null;
  let v = Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1);
  if (m[3]) v += Number(m[3]);
  return v;
}

export function looksLikeIngredient(line: string) {
  const p = parseIngredientLine(line);
  return p.quantity !== null && line.length < 120 && !/[.!?]$/.test(line.trim());
}

/** Parses free text (captions, transcripts, OCR, pasted web text) into a recipe draft. */
export function parseRecipeText(text: string, fallbackName = "Imported recipe"): ParsedRecipe {
  const warnings: string[] = [];
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  let section: "head" | "ing" | "steps" | "notes" = "head";
  const ingredients: ParsedIngredient[] = [];
  const steps: string[] = [];
  const notes: string[] = [];
  const head: string[] = [];
  for (const line of lines) {
    if (ING_HEADER.test(line)) { section = "ing"; continue; }
    if (STEP_HEADER.test(line)) { section = "steps"; continue; }
    if (NOTE_HEADER.test(line)) { section = "notes"; continue; }
    if (section === "head") {
      if (looksLikeIngredient(line)) { section = "ing"; ingredients.push(parseIngredientLine(line)); }
      else head.push(line);
    } else if (section === "ing") {
      if (looksLikeIngredient(line) || (line.length < 60 && !/[.!?]$/.test(line) && /^[-•*▢]/.test(line))) ingredients.push(parseIngredientLine(line));
      else if (/^(\d+[.)]|step\s*\d+)/i.test(line) || line.length > 60) { section = "steps"; steps.push(cleanStep(line)); }
      else ingredients.push(parseIngredientLine(line));
    } else if (section === "steps") steps.push(cleanStep(line));
    else notes.push(line);
  }
  // Without explicit headings, sentences in the head are probably steps.
  if (!steps.length && head.length > 1) {
    steps.push(...head.slice(1).filter((l) => l.length > 25).map(cleanStep));
  }
  const nameLine = head.find((l) => l.length > 2 && l.length < 90 && !/^(serves|servings|prep|cook|total|yield)/i.test(l) && !/https?:/.test(l)) ?? fallbackName;
  const servingsMatch = text.match(/\b(?:serves|servings|yield|makes)\s*:?\s*(\d+)/i) ?? text.match(/(\d+)\s*servings/i);
  const temp = text.match(/(\d{3})\s*°?\s*(F|C)\b|(\d{3})\s*degrees\s*(F|C|fahrenheit|celsius)?/i);
  if (!ingredients.length) warnings.push("No ingredient list was recognised — add ingredients manually.");
  if (!steps.length) warnings.push("No instructions were recognised.");
  const unmatchedQty = ingredients.filter((i) => i.quantity === null && !i.optional).length;
  if (unmatchedQty) warnings.push(`${unmatchedQty} ingredient(s) have no quantity — please check.`);
  return {
    name: nameLine.replace(/^#+\s*/, "").replace(/[🍗🍝🥘🍲🥗🔥✨👇⬇️]/gu, "").trim().slice(0, 120),
    servings: servingsMatch ? Number(servingsMatch[1]) : null,
    prepMinutes: minutesFrom(text, /prep(?:aration)?(?:\s*time)?/),
    cookMinutes: minutesFrom(text, /cook(?:ing)?(?:\s*time)?|bake/),
    temperature: temp ? (temp[1] ? `${temp[1]}°${temp[2].toUpperCase()}` : `${temp[3]}°${(temp[4] ?? "F")[0].toUpperCase()}`) : "",
    ingredients,
    instructions: steps,
    notes: notes.join("\n"),
    warnings,
  };
}

function cleanStep(line: string) {
  return line.replace(/^(\d+[.)]\s*|step\s*\d+\s*[:.-]?\s*|[-•*]\s*)/i, "").trim();
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
