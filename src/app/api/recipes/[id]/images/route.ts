import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUpload, fileFromFormData } from "@/lib/files";
import { withViewer } from "../../../_util";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withViewer(async (viewer) => {
    const { id } = await params;
    await prisma.recipe.findUniqueOrThrow({ where: { id } });
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file || !file.type.startsWith("image/")) return NextResponse.json({ error: "Upload an image" }, { status: 400 });
    const stored = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: "SHARED", purpose: "recipe" });
    await prisma.recipeImage.create({ data: { recipeId: id, fileId: stored.id } });
    return NextResponse.json({ id: stored.id });
  });
}
