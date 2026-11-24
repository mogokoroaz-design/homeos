import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { importHealthExport } from "@/lib/personal/health";
import { cacheDir } from "@/lib/paths";
import { withViewer } from "../../_util";

export const maxDuration = 900;

/**
 * Upload of the Apple Health export (zip or export.xml) as the raw request body. Streamed to a
 * temporary file (exports can be several GB), imported into the uploader's private records, then deleted.
 */
export async function POST(req: Request) {
  return withViewer(async (viewer) => {
    if (!req.body) return NextResponse.json({ error: "No file received" }, { status: 400 });
    const since = new URL(req.url).searchParams.get("since");
    await fs.promises.mkdir(cacheDir(), { recursive: true });
    const tmp = path.join(cacheDir(), `health-${randomUUID()}.upload`);
    try {
      await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
      const summary = await importHealthExport(viewer.profileId, tmp, since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null);
      return NextResponse.json(summary);
    } finally {
      await fs.promises.rm(tmp, { force: true });
    }
  });
}
