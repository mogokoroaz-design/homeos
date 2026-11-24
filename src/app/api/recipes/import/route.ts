import { NextResponse } from "next/server";
import { importFromScreenshots, importFromVideo } from "@/lib/food/importer";
import { fileFromFormData } from "@/lib/files";
import { withViewer } from "../../_util";

export const maxDuration = 180;

export async function POST(req: Request) {
  return withViewer(async (viewer) => {
    const fd = await req.formData();
    const method = String(fd.get("method"));
    if (method === "SCREENSHOT") {
      const files = (await Promise.all(fd.getAll("files").map(fileFromFormData))).filter((f): f is NonNullable<typeof f> => Boolean(f));
      if (!files.length) return NextResponse.json({ error: "Add at least one screenshot" }, { status: 400 });
      const r = await importFromScreenshots(files, viewer);
      return NextResponse.json({ importId: r.importId });
    }
    if (method === "VIDEO") {
      const file = await fileFromFormData(fd.get("file"));
      if (!file || !file.type.startsWith("video/")) return NextResponse.json({ error: "Choose a video file (mp4, mov, webm)" }, { status: 400 });
      const r = await importFromVideo(file, String(fd.get("transcript") ?? ""), viewer);
      return NextResponse.json({ importId: r.importId });
    }
    return NextResponse.json({ error: "Unknown import method" }, { status: 400 });
  });
}
