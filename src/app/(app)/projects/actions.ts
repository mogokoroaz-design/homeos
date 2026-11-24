"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString } from "@/lib/validation";
import { buildProjectProposal, refineProposal } from "@/lib/projects/builder";
import { projectDef, type ProjectDef } from "@/lib/projects/schema";
import { createProjectFromDef, getOwnProject, saveEntry, deleteEntry, upsertField, archiveField, moveField, setIntegrationStatus, addIntegration } from "@/lib/projects/projects";
import { getLocalModel, extractJson } from "@/lib/ai/provider";
import { audit } from "@/lib/audit";

export async function proposeProjectAction(description: string): Promise<ActionResult<{ proposal: ProjectDef; notes: string[]; engine: string }>> {
  await requireViewer();
  return run(async () => {
    if (description.trim().length < 5) throw new Error("Describe what you want to track");
    const base = buildProjectProposal(description);
    const model = await getLocalModel();
    if (model) {
      try {
        const out = await model.complete({
          system: `Design a personal tracking project. Reply with JSON: {"name": string, "description": string, "fields": [{"key": snake_case, "label": string, "type": one of SHORT_TEXT LONG_TEXT NUMBER RATING SINGLE_SELECT MULTI_SELECT BOOLEAN DATE TIME DURATION CHECKLIST IMAGE TAGS, "required": boolean, "config": {"min"?: number, "max"?: number, "unit"?: string, "options"?: string[]}}]}. Use only what the user describes.`,
          prompt: description, json: true, maxTokens: 900, timeoutMs: 45_000,
        });
        const j = extractJson(out) as Partial<ProjectDef>;
        const refined = projectDef.parse({ ...base.proposal, name: j.name || base.proposal.name, fields: j.fields });
        return { proposal: refined, notes: ["Structure proposed by local AI and validated against the project schema.", ...base.notes.filter((n) => !n.startsWith("Fields were"))], engine: model.label };
      } catch {
        /* fall back to rule-based proposal */
      }
    }
    return { ...base, engine: "rules" };
  });
}

/** Applies plain-language edits ("add a photo, make energy 1-10") to a proposal before it is created. */
export async function refineProjectAction(json: string, instruction: string): Promise<ActionResult<{ proposal: ProjectDef; changes: string[]; notUnderstood: string[]; engine: string }>> {
  await requireViewer();
  return run(async () => {
    const current = projectDef.parse(JSON.parse(json));
    if (!instruction.trim()) throw new Error("Describe the change, e.g. “add a photo and make energy 1-10”");
    const rules = refineProposal(current, instruction);
    if (!rules.notUnderstood.length) return { ...rules, engine: "rules" };
    const model = await getLocalModel();
    if (model) {
      try {
        const out = await model.complete({
          system: `You edit a personal tracking project definition. Apply the user's instruction and reply with the COMPLETE updated JSON object only, same shape: {"name","description","icon","fields":[{"key","label","type","required","config"}],"reminder","integrations"}. Allowed field types: SHORT_TEXT LONG_TEXT NUMBER RATING SINGLE_SELECT MULTI_SELECT BOOLEAN DATE TIME DURATION CHECKLIST IMAGE TAGS FORMULA. Keep existing keys unchanged.`,
          prompt: `Project: ${JSON.stringify(rules.proposal)}\nInstruction: ${rules.notUnderstood.join("; ")}`, json: true, maxTokens: 1200, timeoutMs: 45_000,
        });
        const proposal = projectDef.parse(extractJson(out));
        return { proposal, changes: [...rules.changes, `Local AI applied: ${rules.notUnderstood.join("; ")}`], notUnderstood: [], engine: model.label };
      } catch {
        /* keep the rule-based result */
      }
    }
    return { ...rules, engine: "rules" };
  });
}

export async function createProjectAction(json: string): Promise<ActionResult<{ id: string }>> {
  const viewer = await requireViewer();
  return run(async () => ({ id: (await createProjectFromDef(viewer, projectDef.parse(JSON.parse(json)))).id }), "Project created");
}

export async function saveEntryAction(projectId: string, date: string, json: string, entryId?: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => saveEntry(viewer, projectId, dateString.parse(date), JSON.parse(json), entryId), "Entry saved");
}
export async function deleteEntryAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => deleteEntry(viewer, String(fd.get("projectId")), String(fd.get("id"))));
}
export async function upsertFieldAction(projectId: string, json: string, fieldId?: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => upsertField(viewer, projectId, JSON.parse(json), fieldId), "Field saved");
}
export async function archiveFieldAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => archiveField(viewer, String(fd.get("projectId")), String(fd.get("id"))));
}
export async function moveFieldAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => moveField(viewer, String(fd.get("projectId")), String(fd.get("id")), fd.get("dir") === "up" ? -1 : 1));
}
export async function integrationStatusAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(() => setIntegrationStatus(viewer, String(fd.get("projectId")), String(fd.get("id")), fd.get("status") === "APPROVED" ? "APPROVED" : "REVOKED"));
}
export async function addIntegrationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(() => addIntegration(viewer, String(fd.get("projectId")), { kind: "INSIGHTS_SUMMARY", metric: z.enum(["entry_count", "field_sum", "field_average"]).parse(fd.get("metric")), fieldKey: String(fd.get("fieldKey") || "") || undefined, label: z.string().trim().min(1, "Label required").max(80).parse(fd.get("label")) }), "Proposed — approve it to start sharing the summary");
}
export async function addReminderAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const p = await getOwnProject(viewer, String(fd.get("projectId")));
    const weekdays = fd.getAll("weekday").map(String).join(",") || "0,1,2,3,4,5,6";
    await prisma.projectReminder.create({ data: { projectId: p.id, time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time").parse(fd.get("time")), weekdays, message: String(fd.get("message") || `Time for ${p.name}`) } });
  }, "Reminder added to your calendar (private)");
}
export async function deleteReminderAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => { const p = await getOwnProject(viewer, String(fd.get("projectId"))); await prisma.projectReminder.delete({ where: { id: String(fd.get("id")), projectId: p.id } }); });
}
export async function updateProjectAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => { const p = await getOwnProject(viewer, String(fd.get("projectId"))); await prisma.project.update({ where: { id: p.id }, data: { name: z.string().trim().min(1).max(80).parse(fd.get("name")), description: String(fd.get("description") ?? "").slice(0, 500) } }); }, "Saved");
}
export async function deleteProjectAction(fd: FormData) {
  const viewer = await requireViewer();
  const p = await getOwnProject(viewer, String(fd.get("projectId")));
  await prisma.project.delete({ where: { id: p.id } });
  await audit({ profileId: viewer.profileId, action: "project.delete", entityType: "project", entityId: p.id, summary: "Deleted private project" });
  redirect("/projects");
}
