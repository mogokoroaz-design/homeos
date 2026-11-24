import { NextResponse } from "next/server";
import { importBackupArchive } from "@/lib/backup";
import { fileFromFormData } from "@/lib/files";
import { withViewer } from "../../_util";

export async function POST(req: Request) {
  return withViewer(async () => {
    const entry = (await req.formData()).get("file");
    if (!entry || typeof entry === "string") return NextResponse.json({ error: "Choose a .tar backup" }, { status: 400 });
    const name = await importBackupArchive(Buffer.from(await entry.arrayBuffer()));
    return NextResponse.json({ name });
  });
}
