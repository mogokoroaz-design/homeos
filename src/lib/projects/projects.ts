import { prisma } from "../db";
import type { Viewer } from "../auth/session";
import { projectDef, fieldDef, validateEntry, type ProjectDef } from "./schema";
import { audit } from "../audit";
import { safeJson } from "../utils";
import { addDays, today, startOfWeek } from "../dates";
import { ForbiddenError } from "../auth/access";

type V = Pick<Viewer, "profileId">;

/** Projects are private: only the owner can read or modify them. */
export async function getOwnProject(viewer: V, id: string) {
  const p = await prisma.project.findUnique({ where: { id }, include: { fields: { where: { archived: false }, orderBy: { sortOrder: "asc" } }, integrations: true, reminders: true } });
  if (!p || p.ownerProfileId !== viewer.profileId) throw new ForbiddenError("Project not found");
  return p;
}

export async function listOwnProjects(viewer: V) {
  return prisma.project.findMany({ where: { ownerProfileId: viewer.profileId, archived: false }, include: { _count: { select: { entries: true } }, entries: { orderBy: { date: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
}

export async function createProjectFromDef(viewer: V, def: ProjectDef) {
  const d = projectDef.parse(def);
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        ownerProfileId: viewer.profileId, name: d.name, description: d.description, icon: d.icon,
        fields: { create: d.fields.map((f, i) => ({ key: f.key, label: f.label, type: f.type, required: f.required, config: JSON.stringify(f.config), sortOrder: i })) },
        reminders: d.reminder ? { create: [{ ...d.reminder }] } : undefined,
        // Integrations are created as PROPOSED; each must be explicitly approved on the project page.
        integrations: { create: d.integrations.map((i) => ({ kind: i.kind, config: JSON.stringify({ metric: i.metric, fieldKey: i.fieldKey, label: i.label }), status: "PROPOSED" })) },
      },
    });
    await audit({ profileId: viewer.profileId, action: "project.create", entityType: "project", entityId: p.id, summary: "Private project created" }, tx);
    return p;
  });
}

export async function upsertField(viewer: V, projectId: string, raw: unknown, fieldId?: string) {
  const project = await getOwnProject(viewer, projectId);
  const f = fieldDef.parse(raw);
  // Validate the whole project with the change applied (unique keys, formula references).
  const others = project.fields.filter((x) => x.id !== fieldId).map((x) => ({ key: x.key, label: x.label, type: x.type, required: x.required, config: safeJson(x.config, {}) }));
  projectDef.parse({ name: project.name, fields: [...others, f] });
  if (fieldId) {
    await prisma.projectField.update({ where: { id: fieldId, projectId }, data: { label: f.label, type: f.type, required: f.required, config: JSON.stringify(f.config) } });
  } else {
    const archivedSameKey = await prisma.projectField.findUnique({ where: { projectId_key: { projectId, key: f.key } } });
    if (archivedSameKey) await prisma.projectField.update({ where: { id: archivedSameKey.id }, data: { archived: false, label: f.label, type: f.type, required: f.required, config: JSON.stringify(f.config), sortOrder: project.fields.length } });
    else await prisma.projectField.create({ data: { projectId, key: f.key, label: f.label, type: f.type, required: f.required, config: JSON.stringify(f.config), sortOrder: project.fields.length } });
  }
  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}

/** Fields are archived rather than deleted so historical entry values are preserved. */
export async function archiveField(viewer: V, projectId: string, fieldId: string) {
  await getOwnProject(viewer, projectId);
  await prisma.projectField.update({ where: { id: fieldId, projectId }, data: { archived: true } });
}

export async function moveField(viewer: V, projectId: string, fieldId: string, dir: -1 | 1) {
  const p = await getOwnProject(viewer, projectId);
  const idx = p.fields.findIndex((f) => f.id === fieldId);
  const swap = p.fields[idx + dir];
  if (idx < 0 || !swap) return;
  await prisma.$transaction([
    prisma.projectField.update({ where: { id: fieldId }, data: { sortOrder: swap.sortOrder } }),
    prisma.projectField.update({ where: { id: swap.id }, data: { sortOrder: p.fields[idx].sortOrder } }),
  ]);
}

export async function saveEntry(viewer: V, projectId: string, date: string, raw: Record<string, unknown>, entryId?: string) {
  const p = await getOwnProject(viewer, projectId);
  const { values, errors } = validateEntry(p.fields, raw);
  if (errors.length) throw new Error(errors.join("; "));
  const json = JSON.stringify(values);
  if (entryId) {
    await prisma.projectEntry.update({ where: { id: entryId, projectId }, data: { date, values: json } });
  } else {
    await prisma.projectEntry.create({ data: { projectId, date, values: json } });
  }
  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}

export async function listEntries(viewer: V, projectId: string, limit = 100) {
  await getOwnProject(viewer, projectId);
  const entries = await prisma.projectEntry.findMany({ where: { projectId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit });
  return entries.map((e) => ({ ...e, parsed: safeJson<Record<string, unknown>>(e.values, {}) }));
}

export async function deleteEntry(viewer: V, projectId: string, entryId: string) {
  await getOwnProject(viewer, projectId);
  await prisma.projectEntry.delete({ where: { id: entryId, projectId } });
}

export async function setIntegrationStatus(viewer: V, projectId: string, integrationId: string, status: "APPROVED" | "REVOKED") {
  await getOwnProject(viewer, projectId);
  await prisma.projectIntegration.update({ where: { id: integrationId, projectId }, data: { status, approvedAt: status === "APPROVED" ? new Date() : null } });
  await audit({ profileId: viewer.profileId, action: `project.integration.${status.toLowerCase()}`, entityType: "projectIntegration", entityId: integrationId, summary: `Integration ${status.toLowerCase()}` });
}

export async function addIntegration(viewer: V, projectId: string, input: { kind: "INSIGHTS_SUMMARY" | "CALENDAR"; metric: string; fieldKey?: string; label: string }) {
  await getOwnProject(viewer, projectId);
  return prisma.projectIntegration.create({ data: { projectId, kind: input.kind, config: JSON.stringify({ metric: input.metric, fieldKey: input.fieldKey, label: input.label }), status: "PROPOSED" } });
}

/**
 * The ONLY data that leaves a private project: aggregate numbers for APPROVED INSIGHTS_SUMMARY
 * integrations. No entry text, field values or dates of individual entries are exposed.
 */
export async function approvedProjectSummaries(weeks = 8) {
  const integrations = await prisma.projectIntegration.findMany({ where: { kind: "INSIGHTS_SUMMARY", status: "APPROVED", project: { archived: false } }, include: { project: { include: { owner: { select: { name: true, color: true } } } } } });
  const since = addDays(startOfWeek(today()), -7 * (weeks - 1));
  const out = [];
  for (const i of integrations) {
    const cfg = safeJson<{ metric: string; fieldKey?: string; label: string }>(i.config, { metric: "entry_count", label: "Entries" });
    const entries = await prisma.projectEntry.findMany({ where: { projectId: i.projectId, date: { gte: since } }, select: { date: true, values: true } });
    const series = Array.from({ length: weeks }, (_, w) => {
      const ws = addDays(since, 7 * w);
      const inWeek = entries.filter((e) => e.date >= ws && e.date <= addDays(ws, 6));
      const nums = cfg.fieldKey ? inWeek.map((e) => Number(safeJson<Record<string, unknown>>(e.values, {})[cfg.fieldKey!])).filter(Number.isFinite) : [];
      const value = cfg.metric === "entry_count" ? inWeek.length : cfg.metric === "field_sum" ? nums.reduce((a, b) => a + b, 0) : nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
      return { week: ws, value: Math.round(value * 10) / 10 };
    });
    out.push({ integrationId: i.id, label: cfg.label, metric: cfg.metric, owner: i.project.owner.name, ownerColor: i.project.owner.color, series });
  }
  return out;
}
