import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { profileForSyncKey, syncPayload, applySync } from "@/lib/personal/health";

/**
 * Daily summaries from the iPhone Shortcut. Authenticated by the profile's private sync key
 * (Authorization: Bearer hos_…); data can only be written to that one profile.
 */
export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const profile = await profileForSyncKey(key);
  if (!profile) return NextResponse.json({ error: "Invalid or revoked sync key" }, { status: 401 });
  try {
    const summary = await applySync(profile.id, syncPayload.parse(await req.json()));
    return NextResponse.json({ ok: true, profile: profile.name, ...summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : e instanceof Error ? e.message : "Sync failed" }, { status: 400 });
  }
}
