import { prisma } from "../db";
import { assertCanViewPersonal } from "../auth/access";
import type { Viewer } from "../auth/session";
import { addDays, today, dateRange, startOfWeek } from "../dates";
import { occurrences } from "../recurrence";
import { METRIC_TYPES, type MetricType } from "../validation";
import { audit } from "../audit";

type V = Pick<Viewer, "profileId">;

// ── Metrics ──
export async function addMetric(viewer: V, input: { date: string; type: MetricType; value: number; note?: string }) {
  if (!(input.type in METRIC_TYPES)) throw new Error("Unknown metric");
  if (!Number.isFinite(input.value) || input.value < 0) throw new Error("Value must be a positive number");
  return prisma.wellnessMetric.create({ data: { profileId: viewer.profileId, date: input.date, type: input.type, value: input.value, unit: METRIC_TYPES[input.type].unit, note: input.note ?? "" } });
}

export async function listMetrics(viewer: V, ownerId: string, type: string, days = 90) {
  await assertCanViewPersonal(viewer, ownerId, "wellness");
  return prisma.wellnessMetric.findMany({ where: { profileId: ownerId, type, date: { gte: addDays(today(), -days) } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
}

export async function latestMetrics(viewer: V, ownerId: string) {
  await assertCanViewPersonal(viewer, ownerId, "wellness");
  const out: Partial<Record<MetricType, { value: number; date: string; unit: string }>> = {};
  for (const type of Object.keys(METRIC_TYPES) as MetricType[]) {
    const m = await prisma.wellnessMetric.findFirst({ where: { profileId: ownerId, type }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    if (m) out[type] = { value: m.value, date: m.date, unit: m.unit };
  }
  return out;
}

export async function deleteMetric(viewer: V, id: string) {
  await prisma.wellnessMetric.deleteMany({ where: { id, profileId: viewer.profileId } });
}

// ── Workouts ──
export async function addWorkout(viewer: V, input: { date: string; type: string; durationMin: number; distanceKm?: number | null; kcalBurned?: number | null; intensity?: string; notes?: string }) {
  if (input.durationMin <= 0) throw new Error("Duration must be positive");
  return prisma.workout.create({ data: { ...input, distanceKm: input.distanceKm ?? null, kcalBurned: input.kcalBurned ?? null, profileId: viewer.profileId } });
}

export async function listWorkouts(viewer: V, ownerId: string, days = 90) {
  await assertCanViewPersonal(viewer, ownerId, "fitness");
  return prisma.workout.findMany({ where: { profileId: ownerId, date: { gte: addDays(today(), -days) } }, orderBy: { date: "desc" } });
}

export async function deleteWorkout(viewer: V, id: string) {
  await prisma.workout.deleteMany({ where: { id, profileId: viewer.profileId } });
}

// ── Habits ──
export async function createHabit(viewer: V, name: string, targetPerWeek: number) {
  return prisma.habit.create({ data: { profileId: viewer.profileId, name, targetPerWeek: Math.min(7, Math.max(1, targetPerWeek)) } });
}

export async function toggleHabit(viewer: V, habitId: string, date: string) {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, profileId: viewer.profileId } });
  if (!habit) throw new Error("Habit not found");
  const existing = await prisma.habitLog.findUnique({ where: { habitId_date: { habitId, date } } });
  if (existing) await prisma.habitLog.delete({ where: { id: existing.id } });
  else await prisma.habitLog.create({ data: { habitId, date } });
  return !existing;
}

export async function habitsWithStatus(viewer: V, ownerId: string, ref = today()) {
  await assertCanViewPersonal(viewer, ownerId, "habits");
  const habits = await prisma.habit.findMany({ where: { profileId: ownerId, active: true }, include: { logs: { where: { date: { gte: addDays(ref, -60) } } } }, orderBy: { createdAt: "asc" } });
  const week = dateRange(startOfWeek(ref), addDays(startOfWeek(ref), 6));
  return habits.map((h) => {
    const dates = new Set(h.logs.map((l) => l.date));
    let streak = 0;
    for (let d = dates.has(ref) ? ref : addDays(ref, -1); dates.has(d); d = addDays(d, -1)) streak++;
    return { ...h, doneToday: dates.has(ref), week: week.map((d) => ({ date: d, done: dates.has(d) })), weekCount: week.filter((d) => dates.has(d)).length, streak };
  });
}

// ── Routines ──
export async function createRoutine(viewer: V, input: { name: string; timeOfDay: string; time?: string | null; steps: string[]; weekdays: string; startDate: string }) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringSchedule.create({ data: { freq: input.weekdays ? "WEEKLY" : "DAILY", interval: 1, byWeekday: input.weekdays, startDate: input.startDate } });
    return tx.personalRoutine.create({ data: { profileId: viewer.profileId, name: input.name, timeOfDay: input.timeOfDay, time: input.time ?? null, steps: JSON.stringify(input.steps.filter(Boolean)), scheduleId: schedule.id } });
  });
}

export async function routinesForDay(viewer: V, ownerId: string, date = today()) {
  await assertCanViewPersonal(viewer, ownerId, "habits");
  const routines = await prisma.personalRoutine.findMany({ where: { profileId: ownerId, active: true }, include: { schedule: true, completions: { where: { date } } } });
  return routines
    .filter((r) => !r.schedule || occurrences(r.schedule, date, date).length > 0)
    .map((r) => ({ ...r, stepsList: JSON.parse(r.steps) as string[], done: r.completions.length > 0 }))
    .sort((a, b) => (a.time ?? a.timeOfDay).localeCompare(b.time ?? b.timeOfDay));
}

export async function toggleRoutine(viewer: V, routineId: string, date: string) {
  const r = await prisma.personalRoutine.findFirst({ where: { id: routineId, profileId: viewer.profileId } });
  if (!r) throw new Error("Routine not found");
  const ex = await prisma.routineCompletion.findUnique({ where: { routineId_date: { routineId, date } } });
  if (ex) await prisma.routineCompletion.delete({ where: { id: ex.id } });
  else await prisma.routineCompletion.create({ data: { routineId, date } });
}

export async function deletePersonalItem(viewer: V, kind: "habit" | "routine", id: string) {
  if (kind === "habit") await prisma.habit.deleteMany({ where: { id, profileId: viewer.profileId } });
  else await prisma.personalRoutine.deleteMany({ where: { id, profileId: viewer.profileId } });
  await audit({ profileId: viewer.profileId, action: `${kind}.delete`, entityType: kind, entityId: id, summary: `Deleted ${kind}` });
}
