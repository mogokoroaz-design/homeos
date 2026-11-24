// Deterministic receipt/bill text parser for OCR output. Every result is reviewed by a person before saving.
import { parseMoneyToCents } from "../money";
import { normalizeUnit } from "../units";

export interface ParsedReceiptItem {
  rawText: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceCents: number | null;
  totalCents: number;
}

export interface ParsedReceipt {
  merchant: string;
  date: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentNote: string;
  categoryKey: string;
  items: ParsedReceiptItem[];
  warnings: string[];
  redactedText: string;
}

const PRICE = String.raw`-?\$?\s?\d{1,5}[.,]\d{2}`;
const SKIP = /\b(sub\s*-?total|total|tax|gst|vat|hst|pst|balance|change|cash|visa|mastercard|amex|debit|credit|card|tender|payment|approved|auth|ref|terminal|thank|savings|you saved|discount total|points|rounding|tip|gratuity|amount due|items? sold|member|loyalty)\b/i;

/** Removes anything that looks like a full payment card number (13–19 digits), keeping only the last 4. */
export function redactCardNumbers(text: string) {
  return text.replace(/\b(?:\d[ -]?){9,15}(\d{4})\b/g, (_m, last4) => `•••• ${last4}`);
}

function parseDateToken(text: string): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const us = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (us) {
    let [a, b, y] = [+us[1], +us[2], +us[3]];
    if (y < 100) y += 2000;
    // Prefer month/day (US); if impossible, treat as day/month.
    let m = a, d = b;
    if (a > 12 && b <= 12) { m = b; d = a; }
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const named = text.match(/\b(\d{1,2})?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?,?\s*(20\d{2})\b/i);
  if (named) {
    const m = months.indexOf(named[2].toLowerCase()) + 1;
    const d = Number(named[1] ?? named[3] ?? 1);
    return `${named[4]}-${pad(m)}-${pad(d)}`;
  }
  return null;
}

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["utilities", /\b(electric|electricity|energy|power|water|gas|utility|utilities|sewer|kwh)\b/i],
  ["subscriptions", /\b(internet|broadband|wifi|netflix|spotify|subscription|mobile|wireless|phone plan|streaming)\b/i],
  ["restaurants", /\b(restaurant|cafe|café|coffee|bistro|grill|pizza|burger|sushi|bar|kitchen|diner|server|table)\b/i],
  ["gardening", /\b(garden|gardening|lawn|landscap|nursery|mulch|plants?)\b/i],
  ["cleaning", /\b(cleaning|cleaner|maid|janitorial)\b/i],
  ["maintenance", /\b(plumb|electrician|repair|hardware|handyman|hvac|maintenance)\b/i],
  ["medical", /\b(pharmacy|clinic|medical|dental|doctor|hospital|rx)\b/i],
  ["transportation", /\b(fuel|petrol|gasoline|diesel|parking|transit|uber|lyft|taxi)\b/i],
  ["groceries", /\b(market|grocery|groceries|supermarket|foods?|fresh|produce|mart|trader|whole foods|aldi|costco|kroger|safeway|walmart|tesco|woolworths|coles|lidl)\b/i],
];

export function guessCategoryFromText(text: string) {
  for (const [key, re] of CATEGORY_RULES) if (re.test(text)) return key;
  return "other";
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const warnings: string[] = [];
  const redactedText = redactCardNumbers(rawText);
  const lines = redactedText.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  const merchant = (lines.slice(0, 6).find((l) => /[a-z]{3,}/i.test(l) && !/\d{3,}/.test(l) && !/receipt|invoice|welcome|store #|tel|phone|www\./i.test(l)) ?? "").replace(/[^\w&'.\- ]/g, "").trim();

  let date: string | null = null;
  for (const l of lines) { date = parseDateToken(l); if (date) break; }
  if (!date) warnings.push("Date not found — please enter it.");

  const amountAfter = (re: RegExp) => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i])) {
        const prices = lines[i].match(new RegExp(PRICE, "g"));
        if (prices?.length) return parseMoneyToCents(prices[prices.length - 1]);
        const next = lines[i + 1]?.match(new RegExp(`^${PRICE}$`));
        if (next) return parseMoneyToCents(next[0]);
      }
    }
    return null;
  };
  const subtotalCents = amountAfter(/\bsub\s*-?\s*total\b/i);
  const taxCents = amountAfter(/\b(tax|gst|vat|hst|pst)\b(?!.*\b(total|incl)\b)/i);
  let totalCents = amountAfter(/\b(total|amount due|balance due|grand total|amount paid|total due)\b(?!.*\bsub)/i);
  if (totalCents !== null && subtotalCents !== null && totalCents < subtotalCents) totalCents = null;
  if (totalCents === null) warnings.push("Total not found — please enter it.");

  const last4 = redactedText.match(/(?:•••• |\*{2,}\s?|x{2,}\s?|ending(?: in)?\s*)(\d{4})\b/i);
  const cardType = redactedText.match(/\b(visa|mastercard|amex|american express|discover|debit|eftpos|interac)\b/i);
  const paymentNote = last4 ? `${cardType ? cardType[1][0].toUpperCase() + cardType[1].slice(1).toLowerCase() + " " : "Card "}ending ${last4[1]}` : /\bcash\b/i.test(redactedText) ? "Cash" : "";

  const items: ParsedReceiptItem[] = [];
  const itemRe = new RegExp(`^(.*?[A-Za-z].*?)\\s+(${PRICE})\\s*(?:[A-Z]{1,2}|\\*)?$`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP.test(line)) continue;
    const m = line.match(itemRe);
    if (!m) continue;
    let name = m[1].trim();
    const totalItem = parseMoneyToCents(m[2]);
    if (totalItem === null || totalItem === 0) continue;
    let quantity = 1;
    let unit = "each";
    let unitPriceCents: number | null = null;
    // "2 @ 1.99", "2 x 1.99", "1.25 lb @ 2.99/lb", "0.82 kg @ $4.99/kg"
    const at = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|oz|l|ml|ea)?\s*(?:@|x|×)\s*\$?(\d+[.,]\d{2})\s*(?:\/\s*(kg|lb|ea|each|g|oz|l))?/i)
      ?? lines[i - 1]?.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|oz|l|ml|ea)?\s*(?:@|x|×)\s*\$?(\d+[.,]\d{2})\s*(?:\/\s*(kg|lb|ea|each|g|oz|l))?$/i);
    if (at) {
      quantity = Number(at[1].replace(",", "."));
      unit = at[2] ? normalizeUnit(at[2]) : at[4] ? normalizeUnit(at[4]) : "each";
      unitPriceCents = parseMoneyToCents(at[3]);
      name = name.replace(at[0], "").trim() || (lines[i - 2] ?? name);
    } else {
      const lead = name.match(/^(\d{1,2})\s*[x×]?\s+(?=[A-Za-z])/);
      if (lead && Number(lead[1]) > 0 && Number(lead[1]) < 50) {
        quantity = Number(lead[1]);
        name = name.slice(lead[0].length);
        unitPriceCents = Math.round(totalItem / quantity);
      } else unitPriceCents = totalItem;
    }
    name = name.replace(/^\d{4,}\s+/, "").replace(/\s{2,}/g, " ").replace(/[^\w&%'.\-/ ]/g, "").trim();
    if (name.length < 2) continue;
    items.push({ rawText: line, name, quantity, unit, unitPriceCents, totalCents: totalItem });
  }
  const itemsSum = items.reduce((a, i) => a + i.totalCents, 0);
  const reference = subtotalCents ?? (totalCents !== null ? totalCents - (taxCents ?? 0) : null);
  if (items.length && reference !== null && Math.abs(itemsSum - reference) > 2) {
    warnings.push(`Item lines add up to ${(itemsSum / 100).toFixed(2)} but the receipt says ${(reference / 100).toFixed(2)} — check for missed or misread lines.`);
  }
  return { merchant, date, subtotalCents, taxCents, totalCents, paymentNote, categoryKey: guessCategoryFromText(merchant) !== "other" ? guessCategoryFromText(merchant) : guessCategoryFromText(redactedText), items, warnings, redactedText };
}
