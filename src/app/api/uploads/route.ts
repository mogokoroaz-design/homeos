import { NextResponse } from "next/server";
import { saveUpload, fileFromFormData } from "@/lib/files";
import { withViewer } from "../_util";

/** Private image upload (e.g. project image fields). Only the uploader can view it. */
export async function POST(req: Request) {
  return withViewer(async (viewer) => {
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file || !file.type.startsWith("image/")) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
    const stored = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: "PRIVATE", purpose: "project" });
    return NextResponse.json({ id: stored.id });
  });
}
