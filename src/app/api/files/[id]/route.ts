import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/files";
import { withViewer } from "../../_util";

// Files are served only through this endpoint, after checking the viewer may see them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withViewer(async (viewer) => {
    const { id } = await params;
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file || (file.visibility === "PRIVATE" && file.ownerProfileId !== viewer.profileId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = await readUpload(file.storagePath);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(data.length),
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
      },
    });
  });
}
