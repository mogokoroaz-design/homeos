// Understands "add 1 cup plain boiled rice to my lunch today", "put pasta on dinner tomorrow",
// "I had 2 eggs for breakfast" — a meal for the plan and/or the food log. Deterministic.
import { addDays, weekday } from "../dates";
import { parseIngredientLine } from "./parse";
import { spokenNumbers } from "./dictation";

export type Slot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export interface MealRequest {
  what: string; // as said, e.g. "1 cup plain boiled rice"
  name: string; // food name, e.g. "plain boiled rice"
  quantity: number | null;
  unit: string;
  date: string;
  slot: Slot;
  who: "me" | "everyone";
  addToPlan: boolean;
  logEaten: boolean;
}

const SLOT: Record<string, Slot> = { breakfast: "BREAKFAST", lunch: "LUNCH", dinner: "DINNER", supper: "DINNER", tea: "DINNER", snack: "SNACK", snacks: "SNACK" };
const SLOT_ENDS: Record<Slot, number> = { BREAKFAST: 11, LUNCH: 15, SNACK: 18, DINNER: 21 };
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function dateFrom(words: string, today: string): string {
  const w = words.toLowerCase();
  if (/\byesterday\b/.test(w)) return addDays(today, -1);
  if (/\btomorrow\b/.test(w)) return addDays(today, 1);
  const day = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(w));
  if (day >= 0) {
    const current = (weekday(today) + 6) % 7; // weekday(): 0 = Sunday → make Monday 0
    const ahead = (day - current + 7) % 7;
    return addDays(today, /\blast\b/.test(w) ? ahead - 7 || -7 : ahead);
  }
  return today;
}

export function parseMealRequest(text: string, today: string, now = new Date()): MealRequest | null {
  const t = text.trim().replace(/[.!?]+$/, "");
  const add = t.match(/^(?:please\s+|can you\s+|could you\s+)?(add|put|plan|schedule|log)\s+(.+?)\s+(?:to|for|on|in|into|as)\s+(?:my|our|the|today'?s|tomorrow'?s|tonight'?s|yesterday'?s|(?:mon|tues|wednes|thurs|fri|satur|sun)day'?s)?\s*(breakfast|lunch|dinner|supper|snacks?)\b(.*)$/i);
  const ate = t.match(/^(?:i|we)?\s*(?:just\s+)?(ate|had|eaten)\s+(.+?)\s+(?:for|at|with)\s+(?:my|our)?\s*(breakfast|lunch|dinner|supper|snacks?|tea)\b(.*)$/i);
  const m = add ?? ate;
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const what = m[2].trim();
  if (/\b(shopping|grocery) list\b|\bpantry\b/i.test(what)) return null;
  const slot = SLOT[m[3].toLowerCase()];
  const context = `${t.slice(0, m.index ?? 0)} ${t} ${m[4]}`;
  const date = /\btonight'?s?\b/i.test(t) ? today : dateFrom(context, today);
  const who: MealRequest["who"] = /\bmy\b/i.test(t) || (ate && !/\b(we|our)\b/i.test(t)) ? "me" : "everyone";
  const parsed = parseIngredientLine(spokenNumbers(what).replace(/^(?:a|an|some)\s+(?=[a-z])/i, ""));
  const isPast = date < today || (date === today && now.getHours() >= SLOT_ENDS[slot]);
  return {
    what,
    name: (parsed.name || what).replace(/^(plain|some|a|an)\s+/i, "").trim(),
    quantity: parsed.quantity,
    unit: parsed.quantity === null ? "" : parsed.unit,
    date, slot, who,
    addToPlan: verb !== "ate" && verb !== "had" && verb !== "eaten" && verb !== "log",
    logEaten: verb === "ate" || verb === "had" || verb === "eaten" || verb === "log" || isPast,
  };
}
