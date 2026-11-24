// Calendar dates are "YYYY-MM-DD" strings in the household's local time.
// Arithmetic is done in UTC on those strings so DST never shifts a date.

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(now = new Date()) {
  return toDateString(now);
}

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
}

export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export function addMonths(s: string, n: number, dayOfMonth?: number) {
  const d = parseDate(s);
  const day = dayOfMonth ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUTC(target);
}

export function weekday(s: string) {
  return parseDate(s).getUTCDay(); // 0 = Sunday
}

export function startOfWeek(s: string) {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd); // Monday
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function dateRange(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthOf(s: string) {
  return s.slice(0, 7);
}

export function monthRange(month: string) {
  const start = `${month}-01`;
  const end = addDays(addMonths(start, 1), -1);
  return { start, end };
}

export function addMonthsToMonth(month: string, n: number) {
  return monthOf(addMonths(`${month}-01`, n));
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(s: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const d = parseDate(s);
  const parts = [] as string[];
  if (opts.weekday) parts.push(WD[d.getUTCDay()] + ",");
  parts.push(`${MO[d.getUTCMonth()]} ${d.getUTCDate()}`);
  if (opts.year) parts.push(String(d.getUTCFullYear()));
  return parts.join(" ");
}

export function formatMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MO[m - 1]} ${y}`;
}

export function weekdayName(n: number, short = true) {
  const long = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return short ? WD[n] : long[n];
}

export function relativeDay(s: string, ref = today()) {
  const diff = daysBetween(ref, s);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatDate(s, { year: s.slice(0, 4) !== ref.slice(0, 4) });
}

export function ageFrom(birthDate: string | null | undefined, ref = today()) {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ry, rm, rd] = ref.split("-").map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age--;
  return age;
}
