import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedHousehold } from "../helpers";
import { saveUpload } from "@/lib/files";
import { saveReviewedReceipt, PossibleDuplicateError, type ReceiptReview } from "@/lib/finance/receipts";
import { recordPrice, productComparison, priceChanges, brandSwitchSavings } from "@/lib/finance/prices";
import { markBillPaid, billOccurrences } from "@/lib/finance/bills";
import { createTask, completeTask, taskOccurrences } from "@/lib/home/tasks";
import { scheduleVisit, completeVisit, recordMaintenance } from "@/lib/home/services";
import { calendarItems } from "@/lib/calendar";
import { homeInsights, spendingInsights } from "@/lib/insights";
import { addDays, today } from "@/lib/dates";
import type { Viewer } from "@/lib/auth/session";

let alex: Viewer, sam: Viewer;
const d = today();
beforeAll(async () => ({ alex, sam } = await seedHousehold()));

async function draftReceipt(seed: string) {
  const f = await saveUpload({ buffer: Buffer.from(`fake-image-${seed}`), name: "r.png", type: "image/png" }, { ownerProfileId: alex.profileId, purpose: "receipt" });
  return prisma.receipt.create({ data: { fileId: f.id, imageHash: f.sha256, merchant: "Fresh Market" } });
}

const review = (over: Partial<ReceiptReview> = {}): ReceiptReview => ({
  merchant: "Fresh Market", storeName: "", date: addDays(d, -40), totalCents: 1574, taxCents: 42, subtotalCents: 1532, categoryKey: "groceries", paymentNote: "Visa ending 4242", paidByProfileId: null, createExpense: true, allowPossibleDuplicate: false,
  items: [
    { name: "Eggs", quantity: 1, unit: "each", unitPriceCents: 449, totalCents: 449, brand: "Happy Hens", packageSize: 12, packageUnit: "each", recordPrice: true, addToPantry: true, foodItemId: null },
    { name: "Bananas", quantity: 1.25, unit: "lb", unitPriceCents: 69, totalCents: 86, brand: "", packageSize: null, packageUnit: "", recordPrice: true, addToPantry: true, foodItemId: null },
    { name: "Milk", quantity: 1, unit: "each", unitPriceCents: 399, totalCents: 399, brand: "Dairy Best", packageSize: 1, packageUnit: "gallon", recordPrice: true, addToPantry: false, foodItemId: null },
    { name: "Greek yogurt", quantity: 2, unit: "each", unitPriceCents: 299, totalCents: 598, brand: "", packageSize: 500, packageUnit: "g", recordPrice: true, addToPantry: false, foodItemId: null },
  ],
  ...over,
});

describe("receipts (acceptance 13–17)", () => {
  it("reviewed receipt → expense + historical prices + optional pantry", async () => {
    const r = await draftReceipt("a");
    expect(await prisma.expense.count()).toBe(0); // nothing before approval
    const res = await saveReviewedReceipt(r.id, review(), alex);
    expect(res).toMatchObject({ prices: 4, pantry: 2 });
    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: res.expenseId! } });
    expect(exp).toMatchObject({ amountCents: 1574, taxCents: 42, receiptId: r.id, source: "RECEIPT" });
    const bananas = await prisma.pantryItem.findFirstOrThrow({ where: { name: "Banana" } });
    expect(bananas).toMatchObject({ quantity: 1.25, unit: "lb" });
    const eggs = await prisma.pantryItem.findFirstOrThrow({ where: { name: "Egg" } });
    expect(eggs).toMatchObject({ quantity: 12, unit: "each" });
    const milk = await prisma.priceRecord.findFirstOrThrow({ where: { variant: { product: { name: "Milk" } } } });
    expect(milk.normalizedUnit).toBe("ml");
    expect(milk.unitPrice).toBeCloseTo(399 / 3785.411784, 6);
    const yogurt = await prisma.priceRecord.findFirstOrThrow({ where: { variant: { product: { name: "Greek Yogurt" } } } });
    expect(yogurt).toMatchObject({ priceCents: 299, quantity: 2, normalizedUnit: "g" });
    expect((await prisma.receipt.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("SAVED");
  });

  it("flags a probable duplicate purchase and rejects re-saving", async () => {
    const r2 = await draftReceipt("b");
    await expect(saveReviewedReceipt(r2.id, review(), alex)).rejects.toBeInstanceOf(PossibleDuplicateError);
    const firstId = (await prisma.receipt.findFirstOrThrow({ where: { status: "SAVED" } })).id;
    await expect(saveReviewedReceipt(firstId, review(), alex)).rejects.toThrow(/already saved/);
  });

  it("keeps price history and compares brands & package sizes fairly (acceptance 18)", async () => {
    await recordPrice({ productName: "Eggs", brandName: "Happy Hens", packageSize: 12, packageUnit: "each", storeName: "Fresh Market", date: addDays(d, -5), priceCents: 499, source: "RECEIPT" });
    await recordPrice({ productName: "Eggs", brandName: "Value", packageSize: 30, packageUnit: "each", storeName: "Big Box", date: addDays(d, -3), priceCents: 899, source: "RECEIPT" });
    await recordPrice({ productName: "Eggs", brandName: "Value", packageSize: 1, packageUnit: "dozen", storeName: "Corner Shop", date: addDays(d, -2), priceCents: 420, source: "MANUAL" });
    const eggsProduct = await prisma.product.findUniqueOrThrow({ where: { name: "Eggs" } });
    const cmp = await productComparison(eggsProduct.id);
    expect(cmp.variants[0]).toMatchObject({ label: "Value · 30 each" });
    expect(cmp.variants[0].latest.unitPrice).toBeCloseTo(899 / 30, 6);
    expect(cmp.stores[0].store).toBe("Big Box");
    const hh = cmp.variants.find((v) => v.label.startsWith("Happy Hens"))!;
    expect(hh.count).toBe(2); // history kept, not overwritten
    expect(hh.changePct).toBeCloseTo(((499 - 449) / 449) * 100, 6);
    expect((await priceChanges()).find((c) => c.product === "Eggs")!.changePct).toBeGreaterThan(0);
    const savings = await brandSwitchSavings(90);
    const eggSaving = savings.find((s) => s.product === "Eggs")!;
    // Happy Hens bought 40 & 5 days ago at 449/12 and 499/12; cheapest is 899/30 per egg.
    expect(eggSaving.potentialSavingsCents).toBe(Math.round((449 / 12 - 899 / 30) * 12 + (499 / 12 - 899 / 30) * 12 + (420 / 12 - 899 / 30) * 12));
  });
});

describe("bills (acceptance 21)", () => {
  it("recurring bill payment records history, an expense and rolls the due date", async () => {
    const sched = await prisma.recurringSchedule.create({ data: { freq: "MONTHLY", interval: 1, byWeekday: "", startDate: "2026-11-15", dayOfMonth: 15 } });
    const cat = await prisma.budgetCategory.findUniqueOrThrow({ where: { key: "utilities" } });
    const bill = await prisma.bill.create({ data: { name: "Electricity", amountCents: 8500, dueDate: "2026-11-15", categoryId: cat.id, scheduleId: sched.id } });
    const occ = await billOccurrences("2026-11-01", "2027-01-31");
    expect(occ.filter((o) => o.billId === bill.id).map((o) => o.date)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    await markBillPaid(bill.id, { paidDate: "2026-11-14", amountCents: 8723, createExpense: true, paidByProfileId: sam.profileId }, sam.profileId);
    const b = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { payments: true } });
    expect(b.dueDate).toBe("2026-12-15");
    expect(b.payments[0]).toMatchObject({ dueDate: "2026-11-15", amountCents: 8723 });
    expect(await prisma.expense.count({ where: { source: "BILL", amountCents: 8723 } })).toBe(1);
  });
});

describe("home (acceptance 19, 20, 25)", () => {
  it("recurring tasks advance on completion and record history", async () => {
    const t = await createTask({ title: "Vacuum", category: "CLEANING", dueDate: d, schedule: { freq: "WEEKLY", interval: 1, byWeekday: "" } }, alex.profileId);
    const occ = await taskOccurrences(d, addDays(d, 20));
    expect(occ.filter((o) => o.taskId === t.id).map((o) => o.date)).toEqual([d, addDays(d, 7), addDays(d, 14)]);
    const r = await completeTask(t.id, sam.profileId);
    expect(r.next).toBe(addDays(d, 7));
    await completeTask(t.id, sam.profileId, { skipped: true });
    expect((await prisma.householdTask.findUniqueOrThrow({ where: { id: t.id } })).dueDate).toBe(addDays(d, 14));
    expect(await prisma.householdTaskCompletion.count({ where: { taskId: t.id } })).toBe(2);
  });

  it("gardener visit → calendar, ledger, next appointment, history", async () => {
    const g = await prisma.serviceProvider.create({ data: { name: "Green Thumb", kind: "GARDENER", rateCents: 6000 } });
    const v = await scheduleVisit({ providerId: g.id, date: d, time: "09:00", instructions: "Trim hedges", paymentCents: 6000 }, alex.profileId);
    expect((await calendarItems(sam, d, d)).some((i) => i.kind === "visit" && i.title === "Green Thumb")).toBe(true);
    const res = await completeVisit(v.id, { notes: "Hedges trimmed, lawn mowed", paymentCents: 6500, recordPayment: true, nextDate: addDays(d, 14), nextInstructions: "Mulch beds" }, alex.profileId);
    const exp = await prisma.expense.findUniqueOrThrow({ where: { id: res.expenseId! }, include: { category: true } });
    expect(exp).toMatchObject({ amountCents: 6500, merchant: "Green Thumb", source: "SERVICE_VISIT" });
    expect(exp.category.key).toBe("gardening");
    expect(res.next).toMatchObject({ date: addDays(d, 14), status: "SCHEDULED", instructions: "Mulch beds" });
    expect((await calendarItems(alex, addDays(d, 14), addDays(d, 14))).some((i) => i.kind === "visit")).toBe(true);
    const ins = await homeInsights();
    expect(ins.visits.some((x) => x.provider === "Green Thumb" && x.status === "COMPLETED")).toBe(true);
  });

  it("maintenance with cost and next service date", async () => {
    await recordMaintenance({ title: "Dishwasher filter", kind: "APPLIANCE", date: d, costCents: 2500, nextDueDate: addDays(d, 10), recordExpense: true }, alex.profileId);
    expect((await calendarItems(alex, addDays(d, 10), addDays(d, 10))).some((i) => i.kind === "maintenance")).toBe(true);
    expect(await prisma.expense.count({ where: { source: "MAINTENANCE" } })).toBe(1);
  });

  it("insights reflect only recorded data (acceptance 26)", async () => {
    const s = await spendingInsights();
    const all = await prisma.expense.aggregate({ _sum: { amountCents: true } });
    expect(s.trend.reduce((a, t) => a + t.total, 0)).toBe(all._sum.amountCents);
  });
});
