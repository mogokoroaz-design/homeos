import { z } from "zod";
import { prisma } from "../db";
import { saveUpload, readUpload } from "../files";
import { sha256 } from "../auth/pin";
import { ocrImage } from "./ocr";
import { parseReceiptText, redactCardNumbers } from "./receipt-parser";
import { createExpense } from "./ledger";
import { recordPrice, upsertStore } from "./prices";
import { addToPantry } from "../food/pantry";
import { ensureFoodItem, loadFoodIndex, matchFood } from "../food/catalog";
import { dimensionOf, normalizeUnit } from "../units";
import { audit } from "../audit";
import type { Viewer } from "../auth/session";

export class DuplicateReceiptError extends Error {
  constructor(public receiptId: string) {
    super("This receipt image has already been imported.");
  }
}

/** Stores the original image, runs local OCR and creates a draft awaiting review. Nothing reaches the ledger yet. */
export async function importReceiptImage(file: { buffer: Buffer; name: string; type: string }, viewer: Pick<Viewer, "profileId">) {
  if (!file.type.startsWith("image/")) throw new Error("Upload a photo or image of the receipt (JPEG, PNG or WebP).");
  const hash = sha256(file.buffer);
  const dup = await prisma.receipt.findUnique({ where: { imageHash: hash } });
  if (dup) throw new DuplicateReceiptError(dup.id);
  const stored = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: "SHARED", purpose: "receipt" });
  let text = "";
  let confidence: number | null = null;
  let ocrError: string | null = null;
  try {
    const r = await ocrImage(file.buffer);
    text = r.text;
    confidence = r.confidence;
  } catch (e) {
    ocrError = e instanceof Error ? e.message : String(e);
  }
  const parsed = parseReceiptText(text);
  const index = await loadFoodIndex();
  const receipt = await prisma.receipt.create({
    data: {
      fileId: stored.id,
      imageHash: hash,
      merchant: parsed.merchant,
      date: parsed.date,
      subtotalCents: parsed.subtotalCents,
      taxCents: parsed.taxCents,
      totalCents: parsed.totalCents,
      paymentNote: parsed.paymentNote,
      categoryKey: parsed.categoryKey,
      ocrText: parsed.redactedText,
      ocrConfidence: confidence,
      uploadedByProfileId: viewer.profileId,
      items: {
        create: parsed.items.map((it, i) => ({
          rawText: it.rawText, name: it.name, quantity: it.quantity, unit: it.unit, unitPriceCents: it.unitPriceCents, totalCents: it.totalCents, sortOrder: i,
          foodItemId: matchFood(index, it.name)?.id ?? null,
        })),
      },
    },
  });
  await audit({ profileId: viewer.profileId, action: "receipt.import", entityType: "receipt", entityId: receipt.id, summary: `OCR draft ${parsed.merchant || "(unknown merchant)"}` });
  return { receipt, warnings: ocrError ? [`OCR failed: ${ocrError}. Enter the details manually.`, ...parsed.warnings] : parsed.warnings };
}

export const receiptReviewInput = z.object({
  merchant: z.string().trim().min(1, "Merchant is required").max(120),
  storeName: z.string().max(120).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  totalCents: z.number().int().positive("Total must be positive"),
  taxCents: z.number().int().min(0).nullable().default(null),
  subtotalCents: z.number().int().min(0).nullable().default(null),
  categoryKey: z.string().min(1),
  paymentNote: z.string().max(60).default(""),
  paidByProfileId: z.string().nullable().default(null),
  createExpense: z.boolean().default(true),
  allowPossibleDuplicate: z.boolean().default(false),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().default(1),
    unit: z.string().default("each"),
    unitPriceCents: z.number().int().nullable().default(null),
    totalCents: z.number().int(),
    brand: z.string().max(80).default(""),
    packageSize: z.number().positive().nullable().default(null),
    packageUnit: z.string().default(""),
    recordPrice: z.boolean().default(true),
    addToPantry: z.boolean().default(false),
    foodItemId: z.string().nullable().default(null),
  })).max(300),
});
export type ReceiptReview = z.infer<typeof receiptReviewInput>;

export class PossibleDuplicateError extends Error {}

/** Approve step: writes expense, historical prices and (optionally) pantry stock in one transaction. */
export async function saveReviewedReceipt(receiptId: string, input: ReceiptReview, viewer: Pick<Viewer, "profileId">) {
  const data = receiptReviewInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    if (receipt.status === "SAVED") throw new Error("Receipt already saved");
    if (!data.allowPossibleDuplicate) {
      const similar = await tx.expense.findFirst({ where: { date: data.date, amountCents: data.totalCents, merchant: data.merchant } });
      if (similar) throw new PossibleDuplicateError(`An expense of the same amount from ${data.merchant} on ${data.date} already exists. Tick "save anyway" if this is a different purchase.`);
    }
    const store = await upsertStore(data.storeName || data.merchant, tx);
    await tx.receiptItem.deleteMany({ where: { receiptId } });
    let expenseId: string | null = null;
    if (data.createExpense) {
      const e = await createExpense({ date: data.date, amountCents: data.totalCents, taxCents: data.taxCents, merchant: data.merchant, description: `Receipt (${data.items.length} items)`, categoryKey: data.categoryKey, paidByProfileId: data.paidByProfileId ?? viewer.profileId, source: "RECEIPT", receiptId }, viewer.profileId, tx);
      expenseId = e.id;
    }
    const index = await loadFoodIndex(tx);
    let prices = 0, pantry = 0;
    for (const [i, it] of data.items.entries()) {
      const unit = normalizeUnit(it.unit || "each");
      const food = it.foodItemId ? await tx.foodItem.findUnique({ where: { id: it.foodItemId } }) : it.addToPantry ? await ensureFoodItem(it.name, tx, index) : matchFood(index, it.name);
      const row = await tx.receiptItem.create({
        data: { receiptId, name: it.name, quantity: it.quantity, unit, unitPriceCents: it.unitPriceCents, totalCents: it.totalCents, sortOrder: i, foodItemId: food?.id ?? null, addToPantry: it.addToPantry },
      });
      // Price history: weighed items (kg/lb) are one package of the weighed amount; counted items use the package size given.
      const weighed = dimensionOf(unit) === "mass" || dimensionOf(unit) === "volume";
      const packageSize = weighed ? it.quantity : it.packageSize ?? 1;
      const packageUnit = weighed ? unit : it.packageSize ? normalizeUnit(it.packageUnit || "each") : "each";
      const packs = weighed ? 1 : it.quantity;
      const perPack = weighed ? it.totalCents : it.unitPriceCents ?? Math.round(it.totalCents / Math.max(1, it.quantity));
      if (it.recordPrice && perPack > 0) {
        const rec = await recordPrice({ productName: it.name, brandName: it.brand || null, packageSize, packageUnit, storeName: store?.name, date: data.date, priceCents: perPack, quantity: packs, source: "RECEIPT", receiptItemId: row.id, foodItemId: food?.id ?? null, category: data.categoryKey }, tx);
        await tx.receiptItem.update({ where: { id: row.id }, data: { productVariantId: rec.variantId } });
        prices++;
      }
      if (it.addToPantry && food) {
        const qty = weighed ? it.quantity : packs * packageSize;
        await addToPantry({ name: food.name, foodItemId: food.id, quantity: qty, unit: weighed ? unit : packageUnit, reason: "RECEIPT", refType: "receipt", refId: receiptId, profileId: viewer.profileId }, tx);
        pantry++;
      }
    }
    await tx.receipt.update({
      where: { id: receiptId },
      data: { merchant: data.merchant, date: data.date, totalCents: data.totalCents, taxCents: data.taxCents, subtotalCents: data.subtotalCents, categoryKey: data.categoryKey, paymentNote: redactCardNumbers(data.paymentNote), status: "SAVED", reviewedAt: new Date(), expenseId, storeId: store?.id ?? null },
    });
    await audit({ profileId: viewer.profileId, action: "receipt.save", entityType: "receipt", entityId: receiptId, summary: `${data.merchant} ${(data.totalCents / 100).toFixed(2)} · ${prices} prices · ${pantry} pantry` }, tx);
    return { expenseId, prices, pantry };
  });
}

export async function discardReceipt(receiptId: string, viewer: Pick<Viewer, "profileId">) {
  await prisma.receipt.update({ where: { id: receiptId }, data: { status: "DISCARDED", reviewedAt: new Date() } });
  await audit({ profileId: viewer.profileId, action: "receipt.discard", entityType: "receipt", entityId: receiptId, summary: "Discarded draft" });
}

/** Re-runs OCR on the preserved original image (e.g. after an engine upgrade). */
export async function rerunOcr(receiptId: string) {
  const r = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: { file: true } });
  const buffer = await readUpload(r.file.storagePath);
  const res = await ocrImage(buffer);
  const parsed = parseReceiptText(res.text);
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { ocrText: parsed.redactedText, ocrConfidence: res.confidence, items: { deleteMany: {}, create: parsed.items.map((it, i) => ({ rawText: it.rawText, name: it.name, quantity: it.quantity, unit: it.unit, unitPriceCents: it.unitPriceCents, totalCents: it.totalCents, sortOrder: i })) } },
  });
  return parsed;
}
