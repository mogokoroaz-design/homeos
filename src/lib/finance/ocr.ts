import path from "node:path";
import fs from "node:fs/promises";
import { cacheDir } from "../paths";
import { appleOcr, rowsFromBoxes } from "../ocr/apple";

export interface OcrResult { text: string; confidence: number; engine: "apple" | "tesseract" }

/** Upright, evenly lit, sensibly sized copy of a phone photo (what both OCR engines read best). */
export async function prepareForOcr(buffer: Buffer, maxSide = 2600) {
  const sharp = (await import("sharp")).default;
  const img = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w0 = meta.autoOrient?.width ?? meta.width ?? 2000;
  const h0 = meta.autoOrient?.height ?? meta.height ?? 2000;
  const scale = Math.max(w0, h0) > maxSide ? maxSide / Math.max(w0, h0) : Math.max(w0, h0) < 1200 ? 1200 / Math.max(w0, h0) : 1;
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const png = await sharp(buffer, { failOn: "none" }).rotate().resize(width, height).png().toBuffer();
  const clean = await sharp(png).grayscale().normalize().sharpen().png().toBuffer();
  return { png, clean, width, height };
}

// Local OCR: Apple's on-device text recognition on a Mac; Tesseract.js (Apache-2.0) otherwise or as fallback.
// Language data for Tesseract ships in node_modules (@tesseract.js-data/eng), so no network request is made.
export async function ocrImage(buffer: Buffer): Promise<OcrResult> {
  let prepared: Awaited<ReturnType<typeof prepareForOcr>> | null = null;
  try { prepared = await prepareForOcr(buffer); } catch { /* unreadable by sharp — let Tesseract try the original */ }
  if (prepared) {
    const apple = await appleOcr(prepared.png, prepared);
    if (apple && apple.boxes.length) {
      const conf = apple.boxes.reduce((a, b) => a + b.conf, 0) / apple.boxes.length;
      return { text: rowsFromBoxes(apple.boxes).join("\n"), confidence: Math.round(conf * 100), engine: "apple" };
    }
  }
  const { createWorker } = await import("tesseract.js");
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  await fs.mkdir(cacheDir(), { recursive: true });
  const worker = await createWorker("eng", 1, { langPath, cachePath: cacheDir(), gzip: true, logger: () => undefined, errorHandler: () => undefined });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" } as Record<string, string>);
    const { data } = await worker.recognize(prepared?.clean ?? buffer);
    return { text: data.text ?? "", confidence: data.confidence ?? 0, engine: "tesseract" };
  } finally {
    await worker.terminate();
  }
}
