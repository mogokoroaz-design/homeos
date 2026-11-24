// Apple Health integration (free, no Apple developer account needed).
//  • History: the Health app's "Export All Health Data" zip (export.xml), streamed line by line so
//    multi-gigabyte exports don't need to fit in memory.
//  • Ongoing: daily summaries POSTed by an iPhone Shortcut with a per-profile sync key.
// Everything lands in the person's PRIVATE records, keyed so re-imports update instead of duplicating.
import fs from "node:fs";
import readline from "node:readline";
import type { Readable } from "node:stream";
import yauzl from "yauzl";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../audit";
import { METRIC_TYPES, type MetricType } from "../validation";
import { newToken, sha256 } from "../auth/pin";

export const HEALTH_SOURCE = "APPLE_HEALTH";

interface DayAgg {
  steps: Map<string, number>; // per source — iPhone and Watch both record steps, so we take the max source
  active: Map<string, number>;
  water: number;
  weight: { at: number; kg: number } | null;
  rhr: number[];
  sleep: [number, number][]; // asleep intervals (ms)
  inBed: [number, number][];
}

export interface ParsedWorkout { key: string; date: string; type: string; durationMin: number; distanceKm: number | null; kcal: number | null; source: string }

export interface HealthParseResult {
  days: Map<string, DayAgg>;
  workouts: ParsedWorkout[];
  records: number;
  firstDate: string | null;
  lastDate: string | null;
}

const attr = (line: string, name: string) => line.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** "2026-11-20 23:15:00 -0800" → epoch ms (local date is the first 10 chars). */
function toMs(s: string) {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : Date.parse(s);
}

function emptyDay(): DayAgg {
  return { steps: new Map(), active: new Map(), water: 0, weight: null, rhr: [], sleep: [], inBed: [] };
}

function kg(value: number, unit: string) {
  return unit === "lb" ? value * 0.45359237 : unit === "g" ? value / 1000 : unit === "st" ? value * 6.35029318 : value;
}
function kcal(value: number, unit: string) {
  return unit === "kJ" ? value / 4.184 : value; // "kcal" and "Cal" are the same unit
}
function ml(value: number, unit: string) {
  return unit === "L" ? value * 1000 : unit === "fl_oz_us" ? value * 29.5735295625 : unit === "cup_us" ? value * 236.5882365 : value;
}

const WORKOUT_NAMES: Record<string, string> = {
  TraditionalStrengthTraining: "Strength", FunctionalStrengthTraining: "Strength", HighIntensityIntervalTraining: "HIIT",
  MindAndBody: "Mind & body", CoreTraining: "Core", MixedCardio: "Cardio", Elliptical: "Elliptical", StairClimbing: "Stairs",
};
function workoutName(t: string) {
  const k = t.replace("HKWorkoutActivityType", "");
  return WORKOUT_NAMES[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Streams export.xml lines and aggregates per local day. `since` limits to dates ≥ since. */
export async function parseHealthXml(stream: Readable, since?: string | null): Promise<HealthParseResult> {
  const days = new Map<string, DayAgg>();
  const workouts: ParsedWorkout[] = [];
  const day = (d: string) => { let x = days.get(d); if (!x) { x = emptyDay(); days.set(d, x); } return x; };
  let records = 0, firstDate: string | null = null, lastDate: string | null = null;
  let current: (ParsedWorkout & { distUnit?: string }) | null = null;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trimStart();
    if (current) {
      if (line.startsWith("<WorkoutStatistics")) {
        const type = attr(line, "type") ?? "";
        const sum = Number(attr(line, "sum"));
        const unit = attr(line, "unit") ?? "";
        if (Number.isFinite(sum)) {
          if (type.endsWith("ActiveEnergyBurned") && current.kcal === null) current.kcal = Math.round(kcal(sum, unit));
          if (/Distance/.test(type) && current.distanceKm === null) current.distanceKm = Math.round((unit === "mi" ? sum * 1.609344 : unit === "m" ? sum / 1000 : sum) * 100) / 100;
        }
      } else if (line.startsWith("</Workout>")) {
        workouts.push(current);
        current = null;
      }
      continue;
    }
    if (line.startsWith("<Workout ")) {
      const start = attr(line, "startDate");
      if (!start) continue;
      const date = start.slice(0, 10);
      if (since && date < since) continue;
      const dur = Number(attr(line, "duration"));
      const durUnit = attr(line, "durationUnit") ?? "min";
      const type = attr(line, "workoutActivityType") ?? "Workout";
      const dist = Number(attr(line, "totalDistance"));
      const energy = Number(attr(line, "totalEnergyBurned"));
      current = {
        key: `health:workout:${start}:${type}`, date, type: workoutName(type), source: attr(line, "sourceName") ?? "",
        durationMin: Math.max(1, Math.round(durUnit === "s" ? dur / 60 : durUnit === "hr" ? dur * 60 : dur)),
        distanceKm: Number.isFinite(dist) && dist > 0 ? Math.round((attr(line, "totalDistanceUnit") === "mi" ? dist * 1.609344 : dist) * 100) / 100 : null,
        kcal: Number.isFinite(energy) && energy > 0 ? Math.round(kcal(energy, attr(line, "totalEnergyBurnedUnit") ?? "kcal")) : null,
      };
      if (line.endsWith("/>")) { workouts.push(current); current = null; }
      continue;
    }
    if (!line.startsWith("<Record ")) continue;
    const type = attr(line, "type");
    if (!type) continue;
    const start = attr(line, "startDate");
    const end = attr(line, "endDate") ?? start;
    if (!start || !end) continue;
    const isSleep = type === "HKCategoryTypeIdentifierSleepAnalysis";
    const date = (isSleep ? end : start).slice(0, 10); // sleep belongs to the morning you wake up
    if (since && date < since) continue;
    const value = Number(attr(line, "value"));
    const unit = attr(line, "unit") ?? "";
    const src = attr(line, "sourceName") ?? "?";
    let used = true;
    switch (type) {
      case "HKQuantityTypeIdentifierStepCount": { const d = day(date); d.steps.set(src, (d.steps.get(src) ?? 0) + value); break; }
      case "HKQuantityTypeIdentifierActiveEnergyBurned": { const d = day(date); d.active.set(src, (d.active.get(src) ?? 0) + kcal(value, unit)); break; }
      case "HKQuantityTypeIdentifierDietaryWater": day(date).water += ml(value, unit); break;
      case "HKQuantityTypeIdentifierBodyMass": {
        const d = day(date); const at = toMs(start);
        if (!d.weight || at >= d.weight.at) d.weight = { at, kg: kg(value, unit) };
        break;
      }
      case "HKQuantityTypeIdentifierRestingHeartRate": day(date).rhr.push(value); break;
      case "HKCategoryTypeIdentifierSleepAnalysis": {
        const v = attr(line, "value") ?? "";
        const iv: [number, number] = [toMs(start), toMs(end)];
        if (/Asleep/.test(v)) day(date).sleep.push(iv);
        else if (/InBed/.test(v)) day(date).inBed.push(iv);
        else used = false;
        break;
      }
      default: used = false;
    }
    if (used && (Number.isFinite(value) || isSleep)) {
      records++;
      if (!firstDate || date < firstDate) firstDate = date;
      if (!lastDate || date > lastDate) lastDate = date;
    }
  }
  return { days, workouts, records, firstDate, lastDate };
}

/** Total length of overlapping intervals (Watch + iPhone both record sleep). */
export function mergedHours(intervals: [number, number][]) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, curStart = -1, curEnd = -1;
  for (const [a, b] of sorted) {
    if (a > curEnd) { if (curEnd > curStart) total += curEnd - curStart; curStart = a; curEnd = b; }
    else curEnd = Math.max(curEnd, b);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / 3_600_000;
}

const maxOf = (m: Map<string, number>) => (m.size ? Math.max(...m.values()) : 0);

/** Converts aggregated days into one value per metric per day. */
export function dailySummaries(result: HealthParseResult) {
  const out: { date: string; type: MetricType; value: number }[] = [];
  for (const [date, d] of result.days) {
    const steps = Math.round(maxOf(d.steps));
    if (steps > 0) out.push({ date, type: "STEPS", value: steps });
    const active = Math.round(maxOf(d.active));
    if (active > 0) out.push({ date, type: "ACTIVE_KCAL", value: active });
    if (d.water > 0) out.push({ date, type: "WATER_ML", value: Math.round(d.water) });
    if (d.weight) out.push({ date, type: "WEIGHT", value: Math.round(d.weight.kg * 10) / 10 });
    if (d.rhr.length) out.push({ date, type: "RESTING_HR", value: Math.round(d.rhr.reduce((a, b) => a + b, 0) / d.rhr.length) });
    const sleep = d.sleep.length ? mergedHours(d.sleep) : mergedHours(d.inBed);
    if (sleep > 0.5 && sleep < 20) out.push({ date, type: "SLEEP_HOURS", value: Math.round(sleep * 10) / 10 });
  }
  return out;
}

export interface SaveSummary { metrics: number; workouts: number; firstDate: string | null; lastDate: string | null; byType: Record<string, number> }

/** Upserts daily metrics and workouts for one profile. Re-running is safe (no duplicates). */
export async function saveHealthData(profileId: string, metrics: { date: string; type: MetricType; value: number }[], workouts: ParsedWorkout[]): Promise<SaveSummary> {
  const byType: Record<string, number> = {};
  const BATCH = 200;
  for (let i = 0; i < metrics.length; i += BATCH) {
    await prisma.$transaction(metrics.slice(i, i + BATCH).map((m) => {
      byType[m.type] = (byType[m.type] ?? 0) + 1;
      const externalKey = `health:${m.type}:${m.date}`;
      return prisma.wellnessMetric.upsert({
        where: { profileId_externalKey: { profileId, externalKey } },
        create: { profileId, externalKey, date: m.date, type: m.type, value: m.value, unit: METRIC_TYPES[m.type].unit, source: HEALTH_SOURCE },
        update: { value: m.value },
      });
    }));
  }
  for (let i = 0; i < workouts.length; i += BATCH) {
    await prisma.$transaction(workouts.slice(i, i + BATCH).map((w) => prisma.workout.upsert({
      where: { profileId_externalKey: { profileId, externalKey: w.key } },
      create: { profileId, externalKey: w.key, date: w.date, type: w.type, durationMin: w.durationMin, distanceKm: w.distanceKm, kcalBurned: w.kcal, source: HEALTH_SOURCE, notes: w.source ? `from ${w.source}` : "" },
      update: { durationMin: w.durationMin, distanceKm: w.distanceKm, kcalBurned: w.kcal },
    })));
  }
  const dates = [...metrics.map((m) => m.date), ...workouts.map((w) => w.date)].sort();
  return { metrics: metrics.length, workouts: workouts.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, byType };
}

/** Opens export.xml from a zip on disk, or a bare export.xml file. */
async function openExportXml(filePath: string): Promise<{ stream: Readable; close: () => void }> {
  const head = Buffer.alloc(2);
  const fh = await fs.promises.open(filePath, "r");
  await fh.read(head, 0, 2, 0);
  await fh.close();
  if (head.toString("latin1") !== "PK") return { stream: fs.createReadStream(filePath), close: () => undefined };
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Could not open zip"));
      let found = false;
      zip.on("entry", (entry: yauzl.Entry) => {
        if (/(^|\/)export\.xml$/.test(entry.fileName)) {
          found = true;
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) { zip.close(); return reject(e ?? new Error("Could not read export.xml")); }
            resolve({ stream, close: () => zip.close() });
          });
        } else zip.readEntry();
      });
      zip.on("end", () => { if (!found) { zip.close(); reject(new Error("This zip has no export.xml — use Health app → profile picture → Export All Health Data.")); } });
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

export async function importHealthExport(profileId: string, filePath: string, since?: string | null) {
  const { stream, close } = await openExportXml(filePath);
  try {
    const parsed = await parseHealthXml(stream, since);
    if (!parsed.records && !parsed.workouts.length) throw new Error("No supported Health data found in this file.");
    const summary = await saveHealthData(profileId, dailySummaries(parsed), parsed.workouts);
    await prisma.appSetting.upsert({ where: { key: `health.lastImport.${profileId}` }, create: { key: `health.lastImport.${profileId}`, value: JSON.stringify({ at: new Date().toISOString(), ...summary }) }, update: { value: JSON.stringify({ at: new Date().toISOString(), ...summary }) } });
    await audit({ profileId, action: "health.import", entityType: "profile", entityId: profileId, summary: `Apple Health import: ${summary.metrics} daily values, ${summary.workouts} workouts` });
    return summary;
  } finally {
    close();
  }
}

// ── Ongoing sync (iPhone Shortcut) ──

export async function createHealthSyncKey(profileId: string) {
  const key = `hos_${newToken()}`;
  await prisma.householdProfile.update({ where: { id: profileId }, data: { healthTokenHash: sha256(key) } });
  await audit({ profileId, action: "health.key", entityType: "profile", entityId: profileId, summary: "Apple Health sync key created" });
  return key;
}

export async function revokeHealthSyncKey(profileId: string) {
  await prisma.householdProfile.update({ where: { id: profileId }, data: { healthTokenHash: null } });
}

export async function profileForSyncKey(key: string | null | undefined) {
  if (!key || !key.startsWith("hos_")) return null;
  return prisma.householdProfile.findUnique({ where: { healthTokenHash: sha256(key) }, select: { id: true, name: true } });
}

const num = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().finite().nonnegative().optional());
export const syncPayload = z.object({
  days: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((d) => d.slice(0, 10)),
    steps: num, activeKcal: num, weightKg: num, restingHr: num, sleepHours: num, waterMl: num,
  })).max(400).default([]),
  workouts: z.array(z.object({
    start: z.string().min(10), type: z.string().max(60), durationMin: num, distanceKm: num, kcal: num,
  })).max(500).default([]),
});

export async function applySync(profileId: string, body: z.infer<typeof syncPayload>) {
  const map: [keyof (typeof body.days)[number], MetricType][] = [["steps", "STEPS"], ["activeKcal", "ACTIVE_KCAL"], ["weightKg", "WEIGHT"], ["restingHr", "RESTING_HR"], ["sleepHours", "SLEEP_HOURS"], ["waterMl", "WATER_ML"]];
  const metrics: { date: string; type: MetricType; value: number }[] = [];
  for (const d of body.days) {
    for (const [field, type] of map) {
      const v = d[field] as number | undefined;
      if (v !== undefined && v > 0) metrics.push({ date: d.date, type, value: type === "WEIGHT" || type === "SLEEP_HOURS" ? Math.round(v * 10) / 10 : Math.round(v) });
    }
  }
  const workouts: ParsedWorkout[] = body.workouts.filter((w) => (w.durationMin ?? 0) > 0).map((w) => ({
    key: `health:workout:${w.start.slice(0, 16)}:${w.type}`, date: w.start.slice(0, 10), type: w.type, durationMin: Math.round(w.durationMin!), distanceKm: w.distanceKm ?? null, kcal: w.kcal ? Math.round(w.kcal) : null, source: "Shortcut",
  }));
  const summary = await saveHealthData(profileId, metrics, workouts);
  await prisma.appSetting.upsert({ where: { key: `health.lastSync.${profileId}` }, create: { key: `health.lastSync.${profileId}`, value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  return summary;
}
