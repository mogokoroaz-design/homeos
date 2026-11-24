import path from "node:path";
import fs from "node:fs/promises";
import { cacheDir } from "../paths";

// Local OCR with Tesseract.js (Apache-2.0). Language data ships in node_modules
// (@tesseract.js-data/eng), so no network request is made.
export async function ocrImage(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  await fs.mkdir(cacheDir(), { recursive: true });
  const worker = await createWorker("eng", 1, { langPath, cachePath: cacheDir(), gzip: true, logger: () => undefined, errorHandler: () => undefined });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1" } as Record<string, string>);
    const { data } = await worker.recognize(buffer);
    return { text: data.text ?? "", confidence: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}
