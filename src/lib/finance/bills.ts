import { prisma } from "../db";
import { nextOccurrence, occurrences } from "../recurrence";
import { addDays, today } from "../dates";
import { createExpense } from "./ledger";
import { audit } from "../audit";

export async function listBills() {
  return prisma.bill.findMany({ where: { active: true }, include: { category: true, schedule: true, payments: { orderBy: { paidDate: "desc" }, take: 12 }, attachments: { include: { file: true } } }, orderBy: { dueDate: "asc" } });
}

export function billState(b: { dueDate: string; status: string; remindDaysBefore: number }, ref = today()) {
  if (b.status === "PAID") return "paid" as const;
  if (b.dueDate < ref) return "overdue" as const;
  if (b.dueDate <= addDays(ref, b.remindDaysBefore)) return "due-soon" as const;
  return "upcoming" as const;
}

/** Records a payment (tracking only — HomeOS never moves money). Recurring bills roll to the next due date. */
export async function markBillPaid(billId: string, args: { paidDate: string; amountCents: number; createExpense: boolean; paidByProfileId?: string | null }, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { category: true, schedule: true } });
    let expenseId: string | null = null;
    if (args.createExpense) {
      const e = await createExpense({ date: args.paidDate, amountCents: args.amountCents, merchant: bill.provider || bill.name, description: `Bill: ${bill.name} (due ${bill.dueDate})`, categoryKey: bill.category.key, paidByProfileId: args.paidByProfileId ?? profileId, source: "BILL" }, profileId, tx);
      expenseId = e.id;
    }
    await tx.billPayment.create({ data: { billId, dueDate: bill.dueDate, paidDate: args.paidDate, amountCents: args.amountCents, expenseId } });
    if (bill.schedule) {
      const next = nextOccurrence(bill.schedule, bill.dueDate);
      await tx.bill.update({ where: { id: billId }, data: next ? { dueDate: next, status: "UNPAID" } : { status: "PAID" } });
    } else {
      await tx.bill.update({ where: { id: billId }, data: { status: "PAID" } });
    }
    await audit({ profileId, action: "bill.paid", entityType: "bill", entityId: billId, summary: `${bill.name} ${(args.amountCents / 100).toFixed(2)}` }, tx);
  });
}

/** Expected bill due dates within a range (current due date + projected recurrences). */
export async function billOccurrences(from: string, to: string) {
  const bills = await prisma.bill.findMany({ where: { active: true }, include: { schedule: true } });
  const out: { billId: string; name: string; date: string; amountCents: number; status: string; projected: boolean }[] = [];
  for (const b of bills) {
    if (b.dueDate >= from && b.dueDate <= to) out.push({ billId: b.id, name: b.name, date: b.dueDate, amountCents: b.amountCents, status: b.status, projected: false });
    if (b.schedule && b.status !== "PAID") {
      for (const d of occurrences({ ...b.schedule, startDate: b.dueDate }, from, to)) {
        if (d !== b.dueDate) out.push({ billId: b.id, name: b.name, date: d, amountCents: b.amountCents, status: "UNPAID", projected: true });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
