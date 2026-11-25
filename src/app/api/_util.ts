import { NextResponse } from "next/server";
import { AuthError, requireApiViewer, type Viewer } from "@/lib/auth/session";

export async function withViewer(fn: (viewer: Viewer) => Promise<Response>) {
  try {
    const viewer = await requireApiViewer();
    return await fn(viewer);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Your profile is locked (it has a PIN). Reload the page and enter your PIN, then try again." }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 400 });
  }
}
