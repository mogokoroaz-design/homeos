import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { createBackup, listBackups, restoreBackup, backupArchive, importBackupArchive } from "@/lib/backup";
import { saveUpload, readUpload } from "@/lib/files";
import { importReceiptImage, DuplicateReceiptError } from "@/lib/finance/receipts";
import { saveNote } from "@/lib/notes";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer;
beforeAll(async () => ({ alex } = await seedHousehold()));

describe("backup & restore (acceptance 27, 28)", () => {
  it("backs up DB + files, restores them, and round-trips a .tar archive", async () => {
    const note = await saveNote(alex, { title: "Keep me", body: "before backup", visibility: "SHARED" });
    const file = await saveUpload({ buffer: Buffer.from("photo-bytes"), name: "p.png", type: "image/png" }, { ownerProfileId: alex.profileId });
    const name = await createBackup("test", alex.profileId);
    expect((await listBackups()).map((b) => b.name)).toContain(name);

    await prisma.note.delete({ where: { id: note.id } });
    await saveNote(alex, { title: "After backup", body: "x", visibility: "SHARED" });
    const archive = await backupArchive(name);
    const imported = await importBackupArchive(archive);

    await restoreBackup(imported, alex.profileId);
    const titles = (await prisma.note.findMany()).map((n) => n.title);
    expect(titles).toContain("Keep me");
    expect(titles).not.toContain("After backup");
    expect((await readUpload(file.storagePath)).toString()).toBe("photo-bytes");
    expect((await listBackups()).some((b) => b.label === "pre-restore")).toBe(true);
  });

  it("rejects archives that are not HomeOS backups", async () => {
    await expect(importBackupArchive(Buffer.alloc(2048))).rejects.toThrow();
  });
});

describe("local OCR receipt import (acceptance 14) — no network", () => {
  it("reads a rendered receipt image with Tesseract.js and creates a reviewable draft", async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 560 }, deviceScaleFactor: 2 });
    const lines = ["GREEN GROCER", "45 Market Street", "11/20/2026  14:32", "", "BANANAS          0.86", "MILK 2% 1GAL     3.99", "EGGS LARGE DZ    4.49", "BREAD WHOLEMEAL  2.79", "", "SUBTOTAL        12.13", "TAX              0.61", "TOTAL           12.74", "VISA XXXX XXXX XXXX 4242"];
    await page.setContent(`<body style="margin:0;background:#fff"><pre style="font:20px/1.45 'DejaVu Sans Mono',monospace;color:#111;padding:24px">${lines.join("\n")}</pre></body>`);
    const png = await page.screenshot({ type: "png" });
    await browser.close();

    const { receipt, warnings } = await importReceiptImage({ buffer: png, name: "receipt.png", type: "image/png" }, alex);
    const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { items: true } });
    expect(r.status).toBe("PENDING_REVIEW");
    expect(r.totalCents).toBe(1274);
    expect(r.date).toBe("2026-11-20");
    expect(r.merchant).toMatch(/GREEN GROCER/);
    expect(r.items.length).toBeGreaterThanOrEqual(3);
    expect(r.ocrText).not.toMatch(/\d{12}/);
    expect(r.paymentNote).toContain("4242");
    expect(await prisma.expense.count()).toBe(0); // nothing reaches the ledger before review
    expect(Array.isArray(warnings)).toBe(true);
    await expect(importReceiptImage({ buffer: png, name: "again.png", type: "image/png" }, alex)).rejects.toBeInstanceOf(DuplicateReceiptError);
    expect(fs.existsSync("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz")).toBe(true);
  }, 120000);
});
