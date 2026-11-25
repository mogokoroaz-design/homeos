import { NextResponse } from "next/server";
import { fileFromFormData } from "@/lib/files";
import { ocrLines, parseNutritionPanel, decodeBarcode } from "@/lib/food/label";
import { withViewer } from "../../_util";

export const maxDuration = 120;

/** Photo of a nutrition panel → per-100 g values for review. Read on this Mac; the photo isn't stored. */
export async function POST(req: Request) {
  return withViewer(async () => {
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file || !/^image\//.test(file.type)) return NextResponse.json({ error: "Choose a photo of the nutrition label" }, { status: 400 });
    const [{ text }, barcode] = await Promise.all([ocrLines(file.buffer), decodeBarcode(file.buffer)]);
    const panel = parseNutritionPanel(text);
    if (!panel) return NextResponse.json({ error: "Couldn't read a nutrition table. Take the photo straight on, close up, with the whole table in view — or type the values.", barcode }, { status: 422 });
    return NextResponse.json({ ...panel, barcode });
  });
}
