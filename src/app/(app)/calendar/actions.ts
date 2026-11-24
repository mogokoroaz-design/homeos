"use server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString, timeString, scheduleInput } from "@/lib/validation";
import { setOccurrence } from "@/lib/calendar";
import { audit } from "@/lib/audit";

export async function createEventAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const date = dateString.parse(fd.get("date"));
    const sched = scheduleInput.parse({ freq: fd.get("freq") || "NONE", interval: fd.get("interval"), byWeekday: fd.getAll("weekday").map(String).join(","), dayOfMonth: fd.get("dayOfMonth"), endDate: fd.get("endDate") ?? "" });
    const visibility = fd.get("private") === "on" ? "PRIVATE" : "SHARED";
    const kind = z.enum(["HOUSEHOLD", "PERSONAL", "EXERCISE", "APPOINTMENT", "FOOD_PREP"]).parse(fd.get("kind") || "HOUSEHOLD");
    const e = await prisma.$transaction(async (tx) => {
      const s = sched.freq !== "NONE" ? await tx.recurringSchedule.create({ data: { freq: sched.freq, interval: sched.interval, byWeekday: sched.byWeekday, dayOfMonth: sched.dayOfMonth ?? null, startDate: date, endDate: sched.endDate } }) : null;
      return tx.calendarEvent.create({ data: { title: z.string().trim().min(1, "Title required").max(120).parse(fd.get("title")), description: String(fd.get("description") ?? ""), date, startTime: timeString.parse(fd.get("startTime")), endTime: timeString.parse(fd.get("endTime")), kind, visibility, ownerProfileId: viewer.profileId, scheduleId: s?.id ?? null } });
    });
    await audit({ profileId: viewer.profileId, action: "event.create", entityType: "calendarEvent", entityId: e.id, summary: visibility === "PRIVATE" ? "Private event" : e.title });
  }, "Event added");
}
export async function occurrenceAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => setOccurrence(viewer, String(fd.get("eventId")), String(fd.get("date")), z.enum(["DONE", "SKIPPED", "MOVED", "CLEAR"]).parse(fd.get("status")), String(fd.get("movedTo") || "") || undefined));
}
export async function deleteEventAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const e = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: String(fd.get("eventId")) } });
    if (e.visibility === "PRIVATE" && e.ownerProfileId !== viewer.profileId) throw new Error("Not found");
    await prisma.calendarEvent.delete({ where: { id: e.id } });
    if (e.scheduleId) await prisma.recurringSchedule.delete({ where: { id: e.scheduleId } }).catch(() => undefined);
  });
}
export async function createReminderAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => { await prisma.reminder.create({ data: { title: z.string().trim().min(1).parse(fd.get("title")), date: dateString.parse(fd.get("date")), time: timeString.parse(fd.get("time")), ownerProfileId: viewer.profileId, visibility: fd.get("private") === "on" ? "PRIVATE" : "SHARED" } }); }, "Reminder added");
}
export async function toggleReminderAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const r = await prisma.reminder.findUniqueOrThrow({ where: { id: String(fd.get("id")) } });
    if (r.visibility === "PRIVATE" && r.ownerProfileId !== viewer.profileId) throw new Error("Not found");
    await prisma.reminder.update({ where: { id: r.id }, data: { done: !r.done } });
  });
}
