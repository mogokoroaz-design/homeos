import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { saveUpload } from "@/lib/files";
import { saveReviewedReceipt, deleteReceipt } from "@/lib/finance/receipts";
import { addDays, today } from "@/lib/dates";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer;
beforeAll(async () => ({ alex } = await seedHousehold()));

describe("deleting a receipt", () => {
  it("removes the receipt, its photo, expense and prices, and (optionally) the pantry stock it added", async () => {
    const f = await saveUpload({ buffer: Buffer.from("fake-receipt-delete"), name: "r.png", type: "image/png" }, { ownerProfileId: alex.profileId, purpose: "receipt" });
    const r = await prisma.receipt.create({ data: { fileId: f.id, imageHash: f.sha256, merchant: "Corner Shop" } });
    await saveReviewedReceipt(r.id, {
      merchant: "Corner Shop", storeName: "", date: addDays(today(), -1), totalCents: 900, taxCents: null, subtotalCents: null, categoryKey: "groceries", paymentNote: "", paidByProfileId: null, createExpense: true, allowPossibleDuplicate: false,
      items: [
        { name: "Eggs", quantity: 1, unit: "each", unitPriceCents: 450, totalCents: 450, brand: "", packageSize: 12, packageUnit: "each", recordPrice: true, addToPantry: true, foodItemId: null },
        { name: "Rice", quantity: 1, unit: "each", unitPriceCents: 450, totalCents: 450, brand: "", packageSize: 1, packageUnit: "kg", recordPrice: true, addToPantry: true, foodItemId: null },
      ],
    }, alex);
    // Some eggs were already eaten — removing never goes below zero.
    const eggs = await prisma.pantryItem.findFirstOrThrow({ where: { name: "Egg" } });
    await prisma.pantryItem.update({ where: { id: eggs.id }, data: { quantity: 4 } });

    const res = await deleteReceipt(r.id, alex, { removePantry: true });
    expect(res).toMatchObject({ expense: true, prices: 2, pantry: 2 });
    expect(await prisma.receipt.findUnique({ where: { id: r.id } })).toBeNull();
    expect(await prisma.uploadedFile.findUnique({ where: { id: f.id } })).toBeNull();
    expect(await prisma.expense.count({ where: { receiptId: r.id } })).toBe(0);
    expect((await prisma.pantryItem.findFirstOrThrow({ where: { name: "Egg" } })).quantity).toBe(0);
    expect((await prisma.pantryItem.findFirstOrThrow({ where: { name: "Rice" } })).quantity).toBe(0);
  });
});
