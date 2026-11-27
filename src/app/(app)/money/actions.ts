"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { dateString, scheduleInput, reqNum, num } from "@/lib/validation";
import { parseMoneyToCents } from "@/lib/money";
import { createExpense, setBudget, copyBudgets, ensureCategory } from "@/lib/finance/ledger";
import { markBillPaid } from "@/lib/finance/bills";
import { saveReviewedReceipt, receiptReviewInput, discardReceipt, rerunOcr, PossibleDuplicateError, deleteReceipt } from "@/lib/finance/receipts";
import { recordPrice } from "@/lib/finance/prices";
import { audit } from "@/lib/audit";

const money = (v: FormDataEntryValue | null) => parseMoneyToCents(String(v ?? ""));

export async function addExpenseAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const cents = money(fd.get("amount"));
    if (!cents || cents <= 0) throw new Error("Enter an amount");
    await createExpense({ date: dateString.parse(fd.get("date")), amountCents: cents, taxCents: money(fd.get("tax")), merchant: String(fd.get("merchant") ?? ""), description: String(fd.get("description") ?? ""), categoryKey: String(fd.get("category")), paidByProfileId: String(fd.get("paidBy") || viewer.profileId), notes: String(fd.get("notes") ?? "") }, viewer.profileId);
  }, "Expense added");
}
export async function updateExpenseAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const cents = money(fd.get("amount"));
    if (!cents) throw new Error("Enter an amount");
    const cat = await ensureCategory(String(fd.get("category")));
    const e = await prisma.expense.update({ where: { id: String(fd.get("id")) }, data: { date: dateString.parse(fd.get("date")), amountCents: cents, merchant: String(fd.get("merchant") ?? ""), description: String(fd.get("description") ?? ""), categoryId: cat.id, paidByProfileId: String(fd.get("paidBy") || "") || null } });
    await audit({ profileId: viewer.profileId, action: "expense.update", entityType: "expense", entityId: e.id, summary: `${e.merchant} ${(e.amountCents / 100).toFixed(2)}` });
  }, "Updated");
}
export async function deleteExpenseAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const e = await prisma.expense.delete({ where: { id: String(fd.get("id")) } });
    if (e.receiptId) await prisma.receipt.update({ where: { id: e.receiptId }, data: { expenseId: null } }).catch(() => undefined);
    await audit({ profileId: viewer.profileId, action: "expense.delete", entityType: "expense", entityId: e.id, summary: `${e.merchant} ${(e.amountCents / 100).toFixed(2)}` });
  });
}

export async function setBudgetAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => setBudget(String(fd.get("categoryId")), String(fd.get("month")), money(fd.get("amount"))));
}
export async function copyBudgetsAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => copyBudgets(String(fd.get("from")), String(fd.get("to"))));
}
export async function updateCategoryAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.budgetCategory.update({ where: { id: String(fd.get("id")) }, data: { name: z.string().trim().min(1).max(40).parse(fd.get("name")) } }));
}

export async function createBillAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const cents = money(fd.get("amount"));
    if (!cents || cents <= 0) throw new Error("Enter the amount");
    const due = dateString.parse(fd.get("dueDate"));
    const sched = scheduleInput.parse({ freq: fd.get("freq") || "NONE", interval: fd.get("interval"), byWeekday: fd.getAll("weekday").map(String).join(","), dayOfMonth: fd.get("dayOfMonth"), endDate: fd.get("endDate") ?? "" });
    const cat = await ensureCategory(String(fd.get("category") || "utilities"));
    const bill = await prisma.$transaction(async (tx) => {
      const s = sched.freq !== "NONE" ? await tx.recurringSchedule.create({ data: { freq: sched.freq, interval: sched.interval, byWeekday: sched.byWeekday, dayOfMonth: sched.dayOfMonth ?? null, startDate: due, endDate: sched.endDate } }) : null;
      return tx.bill.create({ data: { name: z.string().trim().min(1, "Name required").parse(fd.get("name")), provider: String(fd.get("provider") ?? ""), amountCents: cents, dueDate: due, categoryId: cat.id, scheduleId: s?.id ?? null, remindDaysBefore: Math.round(num.parse(fd.get("remind")) ?? 3), notes: String(fd.get("notes") ?? "") } });
    });
    await audit({ profileId: viewer.profileId, action: "bill.create", entityType: "bill", entityId: bill.id, summary: bill.name });
  }, "Bill added — reminders appear on Today and the calendar");
}
export async function payBillAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const cents = money(fd.get("amount"));
    if (!cents) throw new Error("Enter the amount paid");
    await markBillPaid(String(fd.get("billId")), { paidDate: dateString.parse(fd.get("paidDate")), amountCents: cents, createExpense: fd.get("createExpense") === "on", paidByProfileId: String(fd.get("paidBy") || viewer.profileId) }, viewer.profileId);
  }, "Payment recorded");
}
export async function archiveBillAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.bill.update({ where: { id: String(fd.get("id")) }, data: { active: false } }));
}

export async function saveReceiptAction(receiptId: string, json: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const r = await run(async () => {
    try {
      return await saveReviewedReceipt(receiptId, receiptReviewInput.parse(JSON.parse(json)), viewer);
    } catch (e) {
      if (e instanceof PossibleDuplicateError) throw new Error(`DUPLICATE: ${e.message}`);
      throw e;
    }
  }, (x) => `Saved: expense recorded${x.prices ? `, ${x.prices} price(s) added to history` : ""}${x.pantry ? `, ${x.pantry} item(s) added to pantry` : ""}`);
  return r;
}
export async function discardReceiptAction(fd: FormData) {
  const viewer = await requireViewer();
  await discardReceipt(String(fd.get("id")), viewer);
  redirect("/money/receipts");
}
export async function rerunOcrAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => rerunOcr(String(fd.get("id"))));
}

export async function addPriceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const price = money(fd.get("price"));
    if (!price || price <= 0) throw new Error("Enter the price");
    const source = z.enum(["MANUAL", "ESTIMATE", "EXTERNAL"]).parse(fd.get("source") || "MANUAL");
    await recordPrice({ productName: z.string().trim().min(1, "Product required").parse(fd.get("product")), brandName: String(fd.get("brand") ?? ""), variantName: String(fd.get("variant") ?? ""), packageSize: reqNum.parse(fd.get("size")), packageUnit: String(fd.get("unit") || "each"), storeName: String(fd.get("store") ?? ""), date: dateString.parse(fd.get("date")), priceCents: price, regularPriceCents: money(fd.get("regular")), isPromo: fd.get("promo") === "on", source });
    await audit({ profileId: viewer.profileId, action: "price.record", entityType: "price", summary: `${fd.get("product")} ${(price / 100).toFixed(2)}` });
  }, "Price recorded");
}
export async function linkProductFoodAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.product.update({ where: { id: String(fd.get("productId")) }, data: { foodItemId: String(fd.get("foodItemId") || "") || null } }));
}
export async function saveComparisonAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => prisma.priceComparison.create({ data: { name: String(fd.get("name") || "Comparison"), productId: String(fd.get("productId")) } }));
}

export async function deleteReceiptAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const res = await run(async () => deleteReceipt(String(fd.get("id")), viewer, { removePantry: fd.get("removePantry") === "on" }), "Receipt deleted");
  if (res.ok) redirect("/money/receipts");
  return res;
}
