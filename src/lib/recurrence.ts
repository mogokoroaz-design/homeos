import { addDays, addMonths, parseDate, weekday } from "./dates";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export interface Schedule {
  freq: string;
  interval: number;
  byWeekday: string; // "1,3" (0=Sunday) — WEEKLY only
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
}

export function parseWeekdays(s: string) {
  return s.split(",").map((x) => x.trim()).filter((x) => x !== "").map(Number).filter((n) => n >= 0 && n <= 6);
}

/** All occurrence dates of a schedule within [from, to], inclusive. Deterministic, bounded. */
export function occurrences(s: Schedule, from: string, to: string, limit = 500): string[] {
  const out: string[] = [];
  const interval = Math.max(1, s.interval || 1);
  const end = s.endDate && s.endDate < to ? s.endDate : to;
  if (end < s.startDate) return out;
  if (s.freq === "DAILY") {
    let d = s.startDate;
    if (from > d) {
      const skip = Math.floor((parseDate(from).getTime() - parseDate(d).getTime()) / 86400000 / interval) * interval;
      d = addDays(d, skip);
    }
    for (; d <= end && out.length < limit; d = addDays(d, interval)) if (d >= from) out.push(d);
  } else if (s.freq === "WEEKLY") {
    const days = parseWeekdays(s.byWeekday);
    const wds = days.length ? days : [weekday(s.startDate)];
    // Week index is counted from the Monday of the start week.
    const startWd = weekday(s.startDate);
    const weekStart = addDays(s.startDate, startWd === 0 ? -6 : 1 - startWd);
    let d = from > s.startDate ? from : s.startDate;
    for (; d <= end && out.length < limit; d = addDays(d, 1)) {
      const weeks = Math.floor((parseDate(d).getTime() - parseDate(weekStart).getTime()) / (7 * 86400000));
      if (weeks % interval === 0 && wds.includes(weekday(d))) out.push(d);
    }
  } else if (s.freq === "MONTHLY") {
    const dom = s.dayOfMonth ?? Number(s.startDate.slice(8, 10));
    for (let i = 0; out.length < limit; i += interval) {
      const d = addMonths(s.startDate, i, dom);
      if (d > end) break;
      if (d >= from && d >= s.startDate) out.push(d);
    }
  } else if (s.freq === "YEARLY") {
    for (let i = 0; out.length < limit; i += 12 * interval) {
      const d = addMonths(s.startDate, i);
      if (d > end) break;
      if (d >= from) out.push(d);
    }
  }
  return out;
}

/** The first occurrence strictly after `after`. */
export function nextOccurrence(s: Schedule, after: string): string | null {
  const horizon = addDays(after, 800);
  const list = occurrences(s, addDays(after, 1), horizon, 1);
  return list[0] ?? null;
}

export function describeSchedule(s: Pick<Schedule, "freq" | "interval" | "byWeekday" | "dayOfMonth"> | null | undefined) {
  if (!s) return "One-off";
  const n = s.interval > 1 ? s.interval : null;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (s.freq) {
    case "DAILY": return n ? `Every ${n} days` : "Daily";
    case "WEEKLY": {
      const days = parseWeekdays(s.byWeekday).map((d) => names[d]).join(", ");
      return `${n ? `Every ${n} weeks` : "Weekly"}${days ? ` on ${days}` : ""}`;
    }
    case "MONTHLY": return `${n ? `Every ${n} months` : "Monthly"}${s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ""}`;
    case "YEARLY": return n ? `Every ${n} years` : "Yearly";
    default: return "One-off";
  }
}
