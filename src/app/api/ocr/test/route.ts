import { NextResponse } from "next/server";
import { ocrImage } from "@/lib/finance/ocr";
import { withViewer } from "../../_util";

/** Settings → "Test text recognition": reads a generated sample so you can see which engine runs on this Mac. */
export async function POST() {
  return withViewer(async () => {
    const sharp = (await import("sharp")).default;
    const sample = "CORNER MARKET\nGREEK YOGURT 500 g      4.99\nTOTAL                  4.99";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260"><rect width="100%" height="100%" fill="#fff"/>${sample.split("\n").map((l, i) => `<text x="30" y="${70 + i * 70}" font-size="40" font-family="Menlo, monospace" xml:space="preserve">${l}</text>`).join("")}</svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const started = Date.now();
    const r = await ocrImage(png);
    return NextResponse.json({ engine: r.engine, text: r.text.trim(), ms: Date.now() - started, ok: /YOGURT/i.test(r.text) && /4\.99/.test(r.text) });
  });
}
