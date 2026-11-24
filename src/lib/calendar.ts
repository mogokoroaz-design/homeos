import { prisma } from "./db";
import type { Viewer } from "./auth/session";
import { occurrences } from "./recurrence";
import { taskOccurrences } from "./home/tasks";
import { billOccurrences } from "./finance/bills";
import { parseWeekdays } from "./recurrence";
import { dateRange } from "./dates";
import { audit } from "./audit";

export type CalKind = "event" | "meal" | "prep" | "task" | "bill" | "visit" | "workout" | "project" | "routine" | "reminder" | "maintenance";

export interface CalItem {
  id: string;
  date: string;
  time: string | null;
  title: string;
  kind: CalKind;
  sub?: string;
  href: string;
  done?: boolean;
  skipped?: boolean;
  isPrivate?: boolean;
  eventId?: string;
  recurring?: boolean;
}

/** Unified calendar across modules, filtered by what the viewer may see. */
export async function calendarItems(viewer: Pick<Viewer, "profileId">, from: string, to: string): Promise<CalItem[]> {
  const out: CalItem[] = [];
  // Stored events (household + the viewer's own private events)
  const events = await prisma.calendarEvent.findMany({
    where: { OR: [{ visibility: "SHARED" }, { ownerProfileId: viewer.profileId }], AND: [{ OR: [{ date: { gte: from, lte: to } }, { scheduleId: { not: null }, date: { lte: to } }] }] },
    include: { schedule: true, overrides: true },
  });
  for (const e of events) {
    const dates = e.schedule ? occurrences({ ...e.schedule, startDate: e.date }, from, to) : e.date >= from && e.date <= to ? [e.date] : [];
    for (const d of dates) {
      const ov = e.overrides.find((o) => o.date === d);
      const date = ov?.status === "MOVED" && ov.movedTo ? ov.movedTo : d;
      out.push({ id: `ev:${e.id}:${d}`, eventId: e.id, date, time: e.startTime, title: e.title, kind: e.kind === "EXERCISE" ? "workout" : e.kind === "FOOD_PREP" ? "prep" : "event", sub: e.description || undefined, href: `/calendar?date=${date}`, done: ov?.status === "DONE", skipped: ov?.status === "SKIPPED", isPrivate: e.visibility === "PRIVATE", recurring: Boolean(e.schedule) });
    }
    for (const ov of e.overrides.filter((o) => o.status === "MOVED" && o.movedTo && o.movedTo >= from && o.movedTo <= to && (o.date < from || o.date > to))) {
      out.push({ id: `ev:${e.id}:${ov.date}`, eventId: e.id, date: ov.movedTo!, time: e.startTime, title: e.title, kind: "event", href: `/calendar?date=${ov.movedTo}`, recurring: true });
    }
  }
  // Meals and cooking/prep schedule (shared)
  const meals = await prisma.mealPlanItem.findMany({ where: { date: { gte: from, lte: to } } });
  for (const m of meals) {
    out.push({ id: `meal:${m.id}`, date: m.date, time: m.cookTime, title: m.title, kind: "meal", sub: m.slot.toLowerCase(), href: `/food/plan?week=${m.date}`, done: m.status === "COOKED", skipped: m.status === "SKIPPED" });
    if (m.prepNote) out.push({ id: `prep:${m.id}`, date: m.date, time: null, title: `Prep: ${m.prepNote}`, kind: "prep", sub: m.title, href: `/food/plan?week=${m.date}` });
  }
  for (const t of await taskOccurrences(from, to)) out.push({ id: `task:${t.taskId}:${t.date}`, date: t.date, time: t.time, title: t.title, kind: "task", sub: t.category.toLowerCase(), href: `/home?task=${t.taskId}`, recurring: t.projected });
  for (const b of await billOccurrences(from, to)) out.push({ id: `bill:${b.billId}:${b.date}`, date: b.date, time: null, title: `${b.name} due`, kind: "bill", sub: `${(b.amountCents / 100).toFixed(2)}${b.projected ? " (projected)" : ""}`, href: `/money/bills`, done: b.status === "PAID" });
  const visits = await prisma.serviceVisit.findMany({ where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } }, include: { provider: true } });
  for (const v of visits) out.push({ id: `visit:${v.id}`, date: v.date, time: v.time, title: `${v.provider.name}`, kind: "visit", sub: v.provider.kind.toLowerCase(), href: `/home/services`, done: v.status === "COMPLETED" });
  const maint = await prisma.maintenanceRecord.findMany({ where: { nextDueDate: { gte: from, lte: to } } });
  for (const m of maint) out.push({ id: `maint:${m.id}`, date: m.nextDueDate!, time: null, title: `Maintenance: ${m.title}`, kind: "maintenance", href: `/home/maintenance` });
  const reminders = await prisma.reminder.findMany({ where: { date: { gte: from, lte: to }, OR: [{ visibility: "SHARED" }, { ownerProfileId: viewer.profileId }] } });
  for (const r of reminders) out.push({ id: `rem:${r.id}`, date: r.date, time: r.time, title: r.title, kind: "reminder", href: `/calendar?date=${r.date}`, done: r.done, isPrivate: r.visibility === "PRIVATE" });
  // Private: only the viewer's own workouts, routines and project reminders.
  const workouts = await prisma.workout.findMany({ where: { profileId: viewer.profileId, date: { gte: from, lte: to } } });
  for (const w of workouts) out.push({ id: `wo:${w.id}`, date: w.date, time: null, title: `${w.type} · ${w.durationMin} min`, kind: "workout", href: `/people`, done: true, isPrivate: true });
  const routines = await prisma.personalRoutine.findMany({ where: { profileId: viewer.profileId, active: true }, include: { schedule: true, completions: { where: { date: { gte: from, lte: to } } } } });
  for (const r of routines) {
    const days = r.schedule ? occurrences(r.schedule, from, to) : dateRange(from, to);
    for (const d of days) out.push({ id: `rt:${r.id}:${d}`, date: d, time: r.time, title: r.name, kind: "routine", href: `/people#routines`, done: r.completions.some((c) => c.date === d), isPrivate: true, recurring: true });
  }
  const reminders2 = await prisma.projectReminder.findMany({ where: { active: true, project: { ownerProfileId: viewer.profileId, archived: false } }, include: { project: true } });
  for (const pr of reminders2) {
    const wds = parseWeekdays(pr.weekdays);
    for (const d of dateRange(from, to)) if (wds.includes(new Date(d + "T12:00:00Z").getUTCDay())) out.push({ id: `pr:${pr.id}:${d}`, date: d, time: pr.time, title: pr.message, kind: "project", sub: pr.project.name, href: `/projects/${pr.projectId}`, isPrivate: true, recurring: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
}

export async function setOccurrence(viewer: Pick<Viewer, "profileId">, eventId: string, date: string, status: "DONE" | "SKIPPED" | "MOVED" | "CLEAR", movedTo?: string) {
  const e = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (e.visibility === "PRIVATE" && e.ownerProfileId !== viewer.profileId) throw new Error("Not found");
  if (status === "CLEAR") {
    await prisma.calendarOccurrence.deleteMany({ where: { eventId, date } });
    return;
  }
  if (!e.scheduleId && status === "MOVED" && movedTo) {
    await prisma.calendarEvent.update({ where: { id: eventId }, data: { date: movedTo } });
    return;
  }
  await prisma.calendarOccurrence.upsert({ where: { eventId_date: { eventId, date } }, create: { eventId, date, status, movedTo: movedTo ?? null }, update: { status, movedTo: movedTo ?? null } });
  await audit({ profileId: viewer.profileId, action: `event.${status.toLowerCase()}`, entityType: "calendarEvent", entityId: eventId, summary: `${e.title} ${date}` });
}
