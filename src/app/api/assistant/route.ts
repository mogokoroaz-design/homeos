import { NextResponse } from "next/server";
import { z } from "zod";
import { handleMessage, conversationHistory } from "@/lib/ai/assistant";
import { withViewer } from "../_util";

const body = z.object({ text: z.string().min(1).max(2000), conversationId: z.string().nullable().optional(), surface: z.enum(["KITCHEN", "HOUSEHOLD"]).default("HOUSEHOLD") });

export async function POST(req: Request) {
  return withViewer(async (viewer) => NextResponse.json(await handleMessage(viewer, body.parse(await req.json()))));
}

export async function GET(req: Request) {
  return withViewer(async (viewer) => {
    const id = new URL(req.url).searchParams.get("conversationId");
    if (!id) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
    const h = await conversationHistory(viewer, id);
    return h ? NextResponse.json(h) : NextResponse.json({ error: "Not found" }, { status: 404 });
  });
}
