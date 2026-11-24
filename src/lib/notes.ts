import { prisma } from "./db";
import type { Viewer } from "./auth/session";
import { visibleTo } from "./auth/access";
import { audit } from "./audit";

export interface NoteInput {
  title?: string;
  body?: string;
  checklist?: { text: string; done: boolean }[];
  tags?: string;
  pinned?: boolean;
  visibility: "PRIVATE" | "SHARED";
  link?: { entityType: string; entityId: string; label?: string } | null;
}

export async function listNotes(viewer: Pick<Viewer, "profileId">, filter: { q?: string; tag?: string; entityType?: string; entityId?: string } = {}) {
  return prisma.note.findMany({
    where: {
      AND: [
        visibleTo(viewer),
        filter.q ? { OR: [{ title: { contains: filter.q } }, { body: { contains: filter.q } }, { tags: { contains: filter.q.toLowerCase() } }, { checklist: { contains: filter.q } }] } : {},
        filter.tag ? { tags: { contains: filter.tag } } : {},
        filter.entityType && filter.entityId ? { links: { some: { entityType: filter.entityType, entityId: filter.entityId } } } : {},
      ],
    },
    include: { links: true, attachments: { include: { file: true } }, owner: { select: { name: true, color: true } } },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

async function assertNoteAccess(viewer: Pick<Viewer, "profileId">, id: string) {
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note || (note.visibility === "PRIVATE" && note.ownerProfileId !== viewer.profileId)) throw new Error("Note not found");
  return note;
}

export async function saveNote(viewer: Pick<Viewer, "profileId">, input: NoteInput, id?: string) {
  const tags = (input.tags ?? "").split(",").map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean).join(",");
  const data = { title: (input.title ?? "").slice(0, 200), body: (input.body ?? "").slice(0, 50000), checklist: JSON.stringify((input.checklist ?? []).filter((c) => c.text.trim()).slice(0, 100)), tags, pinned: input.pinned ?? false };
  if (!data.title && !data.body && data.checklist === "[]") throw new Error("Note is empty");
  if (id) {
    const existing = await assertNoteAccess(viewer, id);
    // Only the owner may change who can see a note.
    const visibility = existing.ownerProfileId === viewer.profileId ? input.visibility : existing.visibility;
    return prisma.note.update({ where: { id }, data: { ...data, visibility } });
  }
  const note = await prisma.note.create({ data: { ...data, visibility: input.visibility, ownerProfileId: viewer.profileId, links: input.link ? { create: [{ entityType: input.link.entityType, entityId: input.link.entityId, label: input.link.label ?? "" }] } : undefined } });
  return note;
}

export async function toggleChecklistItem(viewer: Pick<Viewer, "profileId">, id: string, index: number) {
  const note = await assertNoteAccess(viewer, id);
  const list = JSON.parse(note.checklist) as { text: string; done: boolean }[];
  if (!list[index]) return;
  list[index].done = !list[index].done;
  await prisma.note.update({ where: { id }, data: { checklist: JSON.stringify(list) } });
}

export async function togglePin(viewer: Pick<Viewer, "profileId">, id: string) {
  const note = await assertNoteAccess(viewer, id);
  await prisma.note.update({ where: { id }, data: { pinned: !note.pinned } });
}

export async function deleteNote(viewer: Pick<Viewer, "profileId">, id: string) {
  const note = await assertNoteAccess(viewer, id);
  if (note.ownerProfileId !== viewer.profileId && note.visibility === "PRIVATE") throw new Error("Not allowed");
  await prisma.note.delete({ where: { id } });
  await audit({ profileId: viewer.profileId, action: "note.delete", entityType: "note", entityId: id, summary: note.visibility === "PRIVATE" ? "Deleted private note" : note.title || "(untitled note)" });
}

export async function linkNote(viewer: Pick<Viewer, "profileId">, id: string, link: { entityType: string; entityId: string; label?: string }) {
  await assertNoteAccess(viewer, id);
  await prisma.noteLink.create({ data: { noteId: id, ...link, label: link.label ?? "" } });
}

export async function unlinkNote(viewer: Pick<Viewer, "profileId">, linkId: string) {
  const link = await prisma.noteLink.findUniqueOrThrow({ where: { id: linkId } });
  await assertNoteAccess(viewer, link.noteId);
  await prisma.noteLink.delete({ where: { id: linkId } });
}

export const LINK_HREF: Record<string, (id: string) => string> = {
  recipe: (id) => `/food/recipes/${id}`, task: () => `/home`, bill: () => `/money/bills`, provider: () => `/home/services`,
  project: (id) => `/projects/${id}`, pantry: () => `/food/pantry`, expense: () => `/money/expenses`, event: () => `/calendar`, product: (id) => `/money/prices?product=${id}`,
};
