"use server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { listNotes, saveNote, toggleChecklistItem, togglePin, deleteNote, unlinkNote } from "@/lib/notes";
import type { ActionResult } from "@/lib/validation";
import { dateString, timeString, num, reqNum } from "@/lib/validation";
import { parseMoneyToCents } from "@/lib/money";
import { createExpense } from "@/lib/finance/ledger";
import { addToPantry } from "@/lib/food/pantry";
import { addGroceryItem, syncMealPlanGroceries } from "@/lib/food/grocery";
import { createTask } from "@/lib/home/tasks";
import { addMetric } from "@/lib/personal/wellness";
import { logManual } from "@/lib/food/foodlog";
import { prisma } from "@/lib/db";
import { executeAction, rejectAction } from "@/lib/ai/actions";
import { audit } from "@/lib/audit";

// ── Notes (global panel + page) ──
export async function fetchNotes(q: string, entity?: { type: string; id: string }) {
  const viewer = await requireViewer();
  const notes = await listNotes(viewer, { q: q || undefined, entityType: entity?.type, entityId: entity?.id });
  return notes.map((n) => ({ id: n.id, title: n.title, body: n.body, checklist: JSON.parse(n.checklist) as { text: string; done: boolean }[], tags: n.tags, pinned: n.pinned, visibility: n.visibility, updatedAt: n.updatedAt.toISOString(), owner: n.owner.name, ownerColor: n.owner.color, mine: n.ownerProfileId === viewer.profileId, links: n.links.map((l) => ({ id: l.id, entityType: l.entityType, entityId: l.entityId, label: l.label })), attachments: n.attachments.map((a) => ({ id: a.fileId, name: a.file.originalName, mime: a.file.mimeType })) }));
}
export type NoteDTO = Awaited<ReturnType<typeof fetchNotes>>[number];

const noteForm = z.object({
  id: z.string().optional(),
  title: z.string().default(""),
  body: z.string().default(""),
  checklist: z.string().default("[]"),
  tags: z.string().default(""),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
  pinned: z.string().optional(),
  linkType: z.string().optional(),
  linkId: z.string().optional(),
  linkLabel: z.string().optional(),
});

export async function saveNoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const f = noteForm.parse(Object.fromEntries(fd));
    const checklist = (JSON.parse(f.checklist) as { text: string; done: boolean }[]).filter((c) => c.text?.trim());
    const n = await saveNote(viewer, { title: f.title, body: f.body, checklist, tags: f.tags, visibility: f.visibility, pinned: f.pinned === "on", link: f.linkType && f.linkId ? { entityType: f.linkType, entityId: f.linkId, label: f.linkLabel } : null }, f.id || undefined);
    return { id: n.id };
  }, "Saved");
}
export async function toggleNoteItem(id: string, index: number) { const v = await requireViewer(); await runVoid(() => toggleChecklistItem(v, id, index)); }
export async function toggleNotePin(id: string) { const v = await requireViewer(); await runVoid(() => togglePin(v, id)); }
export async function deleteNoteAction(id: string) { const v = await requireViewer(); await runVoid(() => deleteNote(v, id)); }
export async function unlinkNoteAction(linkId: string) { const v = await requireViewer(); await runVoid(() => unlinkNote(v, linkId)); }

// ── Quick add ──
export async function quickExpense(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const cents = parseMoneyToCents(String(fd.get("amount") ?? ""));
    if (!cents || cents <= 0) throw new Error("Enter an amount");
    await createExpense({ date: dateString.parse(fd.get("date")), amountCents: cents, merchant: String(fd.get("merchant") ?? ""), description: String(fd.get("description") ?? ""), categoryKey: String(fd.get("category") ?? "other"), paidByProfileId: String(fd.get("paidBy") || viewer.profileId) }, viewer.profileId);
  }, "Expense recorded in the household ledger");
}

export async function quickPantry(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const qty = reqNum.parse(fd.get("quantity"));
    if (qty <= 0) throw new Error("Quantity must be positive");
    await addToPantry({ name: z.string().trim().min(1, "Name required").parse(fd.get("name")), quantity: qty, unit: String(fd.get("unit") || "each"), location: String(fd.get("location") || "") || undefined, expiryDate: String(fd.get("expiryDate") || "") || null, lowStockThreshold: num.parse(fd.get("lowStock")) ?? null, profileId: viewer.profileId });
  }, "Added to pantry");
}

export async function quickGrocery(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => {
    const r = await addGroceryItem({ name: z.string().trim().min(1, "Name required").parse(fd.get("name")), quantity: num.parse(fd.get("quantity")) ?? 1, unit: String(fd.get("unit") || "each") });
    return r.merged;
  }, (merged) => (merged ? "Merged with an existing list item" : "Added to the shopping list"));
}

export async function quickTask(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    await createTask({ title: z.string().trim().min(1, "Title required").parse(fd.get("title")), category: String(fd.get("category") || "OTHER"), dueDate: String(fd.get("dueDate") || "") || null, assigneeProfileId: String(fd.get("assignee") || "") || null, schedule: fd.get("freq") && fd.get("freq") !== "NONE" ? { freq: String(fd.get("freq")), interval: 1, byWeekday: "" } : null }, viewer.profileId);
  }, "Task added");
}

export async function quickEvent(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const visibility = fd.get("private") === "on" ? "PRIVATE" : "SHARED";
    const e = await prisma.calendarEvent.create({ data: { title: z.string().trim().min(1, "Title required").parse(fd.get("title")), date: dateString.parse(fd.get("date")), startTime: timeString.parse(fd.get("time")), kind: visibility === "PRIVATE" ? "PERSONAL" : "HOUSEHOLD", visibility, ownerProfileId: viewer.profileId } });
    await audit({ profileId: viewer.profileId, action: "event.create", entityType: "calendarEvent", entityId: e.id, summary: visibility === "PRIVATE" ? "Private event" : e.title });
  }, "Event added");
}

export async function quickMetric(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    await addMetric(viewer, { date: dateString.parse(fd.get("date")), type: String(fd.get("type")) as "WEIGHT", value: reqNum.parse(fd.get("value")) });
  }, "Saved to your private wellness log");
}

export async function quickFood(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    await logManual(viewer, { date: dateString.parse(fd.get("date")), slot: String(fd.get("slot") || "SNACK"), description: z.string().trim().min(1, "Describe the food").parse(fd.get("description")), kcal: reqNum.parse(fd.get("kcal")), protein: num.parse(fd.get("protein")), carbs: num.parse(fd.get("carbs")), fat: num.parse(fd.get("fat")), fromLabel: fd.get("fromLabel") === "on" });
  }, "Logged");
}

// ── AI actions (approve / reject) ──
export async function approveAIAction(id: string, payload?: unknown): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const result = await executeAction(viewer, id, payload);
    const a = await prisma.aIAction.findUnique({ where: { id } });
    if (a?.kind === "PANTRY_UPDATE" || a?.kind === "MEAL_COOKED") await syncMealPlanGroceries().catch(() => undefined);
    return result;
  }, "Done");
}
export async function rejectAIAction(id: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => rejectAction(viewer, id), "Dismissed");
}
