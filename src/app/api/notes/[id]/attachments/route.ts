import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUpload, fileFromFormData } from "@/lib/files";
import { withViewer } from "../../../_util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withViewer(async (viewer) => {
    const { id } = await params;
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note || (note.visibility === "PRIVATE" && note.ownerProfileId !== viewer.profileId)) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file || !file.type.startsWith("image/")) return NextResponse.json({ error: "Attach an image file" }, { status: 400 });
    // Attachment inherits the note's privacy.
    const stored = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: note.visibility === "PRIVATE" ? "PRIVATE" : "SHARED", purpose: "note" });
    await prisma.noteAttachment.create({ data: { noteId: id, fileId: stored.id } });
    return NextResponse.json({ id: stored.id });
  });
}
