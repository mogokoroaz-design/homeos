import { NextResponse } from "next/server";
import { importReceiptImage, DuplicateReceiptError } from "@/lib/finance/receipts";
import { fileFromFormData } from "@/lib/files";
import { withViewer } from "../_util";

export const maxDuration = 120;

export async function POST(req: Request) {
  return withViewer(async (viewer) => {
    const file = await fileFromFormData((await req.formData()).get("file"));
    if (!file) return NextResponse.json({ error: "Choose a receipt image" }, { status: 400 });
    try {
      const r = await importReceiptImage(file, viewer);
      return NextResponse.json({ id: r.receipt.id, warnings: r.warnings });
    } catch (e) {
      if (e instanceof DuplicateReceiptError) return NextResponse.json({ error: e.message, duplicateOf: e.receiptId }, { status: 409 });
      throw e;
    }
  });
}
