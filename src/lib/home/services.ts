import { prisma } from "../db";
import { createExpense } from "../finance/ledger";
import { audit } from "../audit";

const KIND_TO_CATEGORY: Record<string, string> = { CLEANER: "cleaning", GARDENER: "gardening", PLUMBER: "maintenance", ELECTRICIAN: "maintenance", REPAIR: "maintenance", OTHER: "other" };

export async function scheduleVisit(input: { providerId: string; date: string; time?: string | null; instructions?: string; paymentCents?: number | null }, profileId: string) {
  const v = await prisma.serviceVisit.create({ data: { providerId: input.providerId, date: input.date, time: input.time ?? null, instructions: input.instructions ?? "", paymentCents: input.paymentCents ?? null } });
  await audit({ profileId, action: "visit.schedule", entityType: "serviceVisit", entityId: v.id, summary: `Visit on ${input.date}` });
  return v;
}

/**
 * Completing a visit records the service history, optionally the payment in the shared ledger,
 * and optionally books the next appointment (which appears on the calendar).
 */
export async function completeVisit(visitId: string, input: { notes?: string; paymentCents?: number | null; recordPayment: boolean; paidByProfileId?: string | null; nextDate?: string | null; nextTime?: string | null; nextInstructions?: string; date?: string }, profileId: string) {
  return prisma.$transaction(async (tx) => {
    const visit = await tx.serviceVisit.findUniqueOrThrow({ where: { id: visitId }, include: { provider: true } });
    let expenseId: string | null = visit.expenseId;
    const amount = input.paymentCents ?? visit.paymentCents;
    if (input.recordPayment && amount && !visit.expenseId) {
      const e = await createExpense({ date: input.date ?? visit.date, amountCents: amount, merchant: visit.provider.name, description: `${visit.provider.kind.toLowerCase()} visit`, categoryKey: KIND_TO_CATEGORY[visit.provider.kind] ?? "other", paidByProfileId: input.paidByProfileId ?? profileId, source: "SERVICE_VISIT" }, profileId, tx);
      expenseId = e.id;
    }
    await tx.serviceVisit.update({ where: { id: visitId }, data: { status: "COMPLETED", notes: input.notes ?? visit.notes, paymentCents: amount ?? null, paid: Boolean(expenseId) || visit.paid, expenseId, date: input.date ?? visit.date } });
    let next = null;
    if (input.nextDate) {
      next = await tx.serviceVisit.create({ data: { providerId: visit.providerId, date: input.nextDate, time: input.nextTime ?? visit.time, instructions: input.nextInstructions ?? visit.instructions, paymentCents: visit.provider.rateCents ?? amount ?? null } });
    }
    await audit({ profileId, action: "visit.complete", entityType: "serviceVisit", entityId: visitId, summary: `${visit.provider.name}${amount ? ` paid ${(amount / 100).toFixed(2)}` : ""}` }, tx);
    return { expenseId, next };
  });
}

export async function providersWithHistory() {
  return prisma.serviceProvider.findMany({
    include: { visits: { orderBy: { date: "desc" }, take: 20 } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function recordMaintenance(input: { title: string; kind: string; assetId?: string | null; providerId?: string | null; date: string; costCents?: number | null; nextDueDate?: string | null; notes?: string; recordExpense: boolean }, profileId: string) {
  return prisma.$transaction(async (tx) => {
    let expenseId: string | null = null;
    if (input.recordExpense && input.costCents) {
      const provider = input.providerId ? await tx.serviceProvider.findUnique({ where: { id: input.providerId } }) : null;
      const e = await createExpense({ date: input.date, amountCents: input.costCents, merchant: provider?.name ?? "", description: input.title, categoryKey: "maintenance", source: "MAINTENANCE" }, profileId, tx);
      expenseId = e.id;
    }
    const rec = await tx.maintenanceRecord.create({ data: { title: input.title, kind: input.kind, assetId: input.assetId ?? null, providerId: input.providerId ?? null, date: input.date, costCents: input.costCents ?? null, nextDueDate: input.nextDueDate ?? null, notes: input.notes ?? "", expenseId } });
    await audit({ profileId, action: "maintenance.record", entityType: "maintenance", entityId: rec.id, summary: input.title }, tx);
    return rec;
  });
}
