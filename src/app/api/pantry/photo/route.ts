import { NextResponse } from "next/server";
import { fileFromFormData, saveUpload } from "@/lib/files";
import { detectFoodInPhoto } from "@/lib/food/photo";
import { withViewer } from "../../_util";

export const maxDuration = 180;

/** Stores the photo locally and returns the detected items for review. Nothing is added to the pantry or list here. */
export async function POST(req: Request) {
  return withViewer(async (viewer) => {
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file) return NextResponse.json({ error: "Choose a photo" }, { status: 400 });
    if (!/^image\//.test(file.type)) return NextResponse.json({ error: "That isn't an image" }, { status: 400 });
    const saved = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: "SHARED", purpose: "food-photo" });
    const result = await detectFoodInPhoto(file.buffer);
    return NextResponse.json({ photoId: saved.id, ...result });
  });
}
