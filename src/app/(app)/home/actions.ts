"use server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString, optionalDate, timeString, scheduleInput, TASK_CATEGORIES, PROVIDER_KINDS, bool } from "@/lib/validation";
import { createTask, completeTask, reopenTask } from "@/lib/home/tasks";
import { scheduleVisit, completeVisit, recordMaintenance } from "@/lib/home/services";
import { parseMoneyToCents } from "@/lib/money";
import { audit } from "@/lib/audit";

function weekdaysFrom(fd: FormData) {
  return fd.getAll("weekday").map(String).join(",");
}

export async function createTaskAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const sched = scheduleInput.parse({ freq: fd.get("freq") || "NONE", interval: fd.get("interval"), byWeekday: weekdaysFrom(fd), dayOfMonth: fd.get("dayOfMonth"), endDate: fd.get("endDate") ?? "" });
    await createTask({
      title: z.string().trim().min(1, "Title required").max(120).parse(fd.get("title")), description: String(fd.get("description") ?? ""), category: z.enum(TASK_CATEGORIES).parse(fd.get("category")),
      area: String(fd.get("area") ?? ""), assigneeProfileId: String(fd.get("assignee") || "") || null, dueDate: optionalDate.parse(fd.get("dueDate") ?? ""), dueTime: timeString.parse(fd.get("dueTime")),
      isDeepClean: fd.get("deepClean") === "on", schedule: sched.freq === "NONE" ? null : { freq: sched.freq, interval: sched.interval, byWeekday: sched.byWeekday, dayOfMonth: sched.dayOfMonth ?? null, endDate: sched.endDate },
    }, viewer.profileId);
  }, "Task created");
}
export async function completeTaskAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => completeTask(String(fd.get("id")), viewer.profileId, { skipped: fd.get("skip") === "1" }));
}
export async function reopenTaskAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => reopenTask(String(fd.get("id"))));
}
export async function deleteTaskAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const t = await prisma.householdTask.update({ where: { id: String(fd.get("id")) }, data: { active: false } });
    await audit({ profileId: viewer.profileId, action: "task.archive", entityType: "task", entityId: t.id, summary: t.title });
  });
}

const providerForm = z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Name required").max(80), kind: z.enum(PROVIDER_KINDS), phone: z.string().max(40).default(""), email: z.string().max(120).default(""), notes: z.string().max(5000).default(""), rate: z.string().default(""), rateUnit: z.string().default("visit") });
export async function saveProviderAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const f = providerForm.parse(Object.fromEntries(fd));
    const data = { name: f.name, kind: f.kind, phone: f.phone, email: f.email, notes: f.notes, rateCents: parseMoneyToCents(f.rate), rateUnit: f.rateUnit };
    const p = f.id ? await prisma.serviceProvider.update({ where: { id: f.id }, data }) : await prisma.serviceProvider.create({ data });
    await audit({ profileId: viewer.profileId, action: f.id ? "provider.update" : "provider.create", entityType: "provider", entityId: p.id, summary: p.name });
  }, "Saved");
}
export async function scheduleVisitAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => scheduleVisit({ providerId: String(fd.get("providerId")), date: dateString.parse(fd.get("date")), time: timeString.parse(fd.get("time")), instructions: String(fd.get("instructions") ?? ""), paymentCents: parseMoneyToCents(String(fd.get("payment") ?? "")) }, viewer.profileId), "Visit scheduled — it's on the calendar");
}
export async function completeVisitAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => completeVisit(String(fd.get("visitId")), {
    notes: String(fd.get("notes") ?? ""), paymentCents: parseMoneyToCents(String(fd.get("payment") ?? "")), recordPayment: fd.get("recordPayment") === "on", paidByProfileId: String(fd.get("paidBy") || viewer.profileId),
    nextDate: optionalDate.parse(fd.get("nextDate") ?? ""), nextTime: timeString.parse(fd.get("nextTime")), nextInstructions: String(fd.get("nextInstructions") ?? "") || undefined, date: optionalDate.parse(fd.get("date") ?? "") ?? undefined,
  }, viewer.profileId), (r) => `Visit recorded${r.expenseId ? ", payment added to the ledger" : ""}${r.next ? ", next visit booked" : ""}`);
}
export async function cancelVisitAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.serviceVisit.update({ where: { id: String(fd.get("id")) }, data: { status: "CANCELLED" } }));
}
export async function saveAssetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => {
    const id = String(fd.get("id") || "");
    const data = { name: z.string().trim().min(1, "Name required").parse(fd.get("name")), location: String(fd.get("location") ?? ""), brand: String(fd.get("brand") ?? ""), model: String(fd.get("model") ?? ""), purchaseDate: optionalDate.parse(fd.get("purchaseDate") ?? ""), warrantyUntil: optionalDate.parse(fd.get("warrantyUntil") ?? ""), notes: String(fd.get("notes") ?? "") };
    if (id) await prisma.homeAsset.update({ where: { id }, data }); else await prisma.homeAsset.create({ data });
  }, "Saved");
}
export async function recordMaintenanceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => recordMaintenance({
    title: z.string().trim().min(1, "Title required").parse(fd.get("title")), kind: String(fd.get("kind") || "REPAIR"), assetId: String(fd.get("assetId") || "") || null, providerId: String(fd.get("providerId") || "") || null,
    date: dateString.parse(fd.get("date")), costCents: parseMoneyToCents(String(fd.get("cost") ?? "")), nextDueDate: optionalDate.parse(fd.get("nextDueDate") ?? ""), notes: String(fd.get("notes") ?? ""), recordExpense: bool.parse(fd.get("recordExpense")),
  }, viewer.profileId), "Maintenance recorded");
}
