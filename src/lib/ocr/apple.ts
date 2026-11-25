// Apple's on-device text recognition (the Vision framework behind Live Text), called through
// macOS's built-in JavaScript for Automation. Free, offline, far better than Tesseract on phone
// photos. Only on macOS; every failure returns null so callers fall back to Tesseract.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { cacheDir } from "../paths";

export interface TextBox { text: string; conf: number; x: number; y: number; w: number; h: number } // normalised 0–1, origin top-left
export interface AppleOcr { boxes: TextBox[]; width: number; height: number }

const SCRIPT = `ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  var url = $.NSURL.fileURLWithPath(argv[0]);
  var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  var req = $.VNRecognizeTextRequest.alloc.init;
  req.setRecognitionLevel(0);
  req.setUsesLanguageCorrection(true);
  var ok = handler.performRequestsError($.NSArray.arrayWithObject(req), null);
  if (!ok) return JSON.stringify({ error: 'perform failed' });
  var res = req.results;
  var out = [];
  for (var i = 0; i < res.count; i++) {
    var o = res.objectAtIndex(i);
    var cands = o.topCandidates(1);
    if (!cands.count) continue;
    var c = cands.objectAtIndex(0);
    var b = o.boundingBox;
    out.push({ t: c.string.js, c: c.confidence, x: b.origin.x, y: b.origin.y, w: b.size.width, h: b.size.height });
  }
  return JSON.stringify({ boxes: out });
}`;

let unavailable = process.platform !== "darwin" || process.env.HOMEOS_OCR === "tesseract";

export function appleOcrAvailable() {
  return !unavailable;
}

/** `image` should already be upright (EXIF applied). */
export async function appleOcr(image: Buffer, size: { width: number; height: number }): Promise<AppleOcr | null> {
  if (unavailable) return null;
  const dir = path.join(cacheDir(), "ocr");
  await fs.mkdir(dir, { recursive: true });
  const script = path.join(dir, "vision-ocr.js");
  await fs.writeFile(script, SCRIPT);
  const file = path.join(dir, `${crypto.randomUUID()}.png`);
  await fs.writeFile(file, image);
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile("osascript", ["-l", "JavaScript", script, file], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out)));
    });
    const parsed = JSON.parse(stdout.trim()) as { boxes?: { t: string; c: number; x: number; y: number; w: number; h: number }[]; error?: string };
    if (!parsed.boxes) return null;
    // Vision's origin is bottom-left; flip to top-left.
    return { width: size.width, height: size.height, boxes: parsed.boxes.map((b) => ({ text: b.t, conf: b.c, x: b.x, y: 1 - b.y - b.h, w: b.w, h: b.h })) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Missing osascript/Vision (very old macOS) → stop trying this run. Other errors: just this image.
    if (/ENOENT|not found|Can't find|-2700/.test(msg)) unavailable = true;
    console.warn("HomeOS: Apple text recognition failed, using Tesseract:", msg.slice(0, 200));
    return null;
  } finally {
    await fs.rm(file, { force: true });
  }
}

/** Joins boxes that sit on the same printed row (receipts put the price far right of the item). */
export function rowsFromBoxes(boxes: TextBox[]): string[] {
  const sorted = [...boxes].filter((b) => b.text.trim()).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: { yc: number; h: number; items: TextBox[] }[] = [];
  for (const b of sorted) {
    const yc = b.y + b.h / 2;
    const row = rows.find((r) => Math.abs(r.yc - yc) < Math.min(r.h, b.h) * 0.55);
    if (row) { row.items.push(b); row.yc = (row.yc * (row.items.length - 1) + yc) / row.items.length; }
    else rows.push({ yc, h: b.h, items: [b] });
  }
  return rows.sort((a, b) => a.yc - b.yc).map((r) => r.items.sort((a, b) => a.x - b.x).map((b) => b.text.trim()).join("   "));
}
