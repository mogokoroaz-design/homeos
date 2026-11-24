import { prisma, type Tx } from "../db";
import { monthRange, addMonthsToMonth } from "../dates";
import { audit } from "../audit";

import { DEFAULT_CATEGORIES } from "./categories";
export { DEFAULT_CATEGORIES };

export async function ensureDefaultCategories(tx: Tx = prisma) {
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await tx.budgetCategory.upsert({ where: { key: c.key }, create: { ...c, sortOrder: i }, update: {} });
  }
}

export async function ensureCategory(key: string, tx: Tx = prisma) {
  const found = await tx.budgetCategory.findUnique({ where: { key } });
  if (found) return found;
  const def = DEFAULT_CATEGORIES.find((c) => c.key === key) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  return tx.budgetCategory.upsert({ where: { key: def.key }, create: def, update: {} });
}

export async function listCategories() {
  return prisma.budgetCategory.findMany({ orderBy: { sortOrder: "asc" } });
}

export interface ExpenseInput {
  date: string;
  amountCents: number;
  taxCents?: number | null;
  merchant?: string;
  description?: string;
  categoryKey: string;
  paidByProfileId?: string | null;
  source?: string;
  notes?: string;
  receiptId?: string | null;
}

export async function createExpense(input: ExpenseInput, profileId: string, tx: Tx = prisma) {
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new Error("Amount must be a non-zero value");
  const cat = await ensureCategory(input.categoryKey, tx);
  const e = await tx.expense.create({
    data: {
      date: input.date, amountCents: input.amountCents, taxCents: input.taxCents ?? null, merchant: input.merchant ?? "",
      description: input.description ?? "", categoryId: cat.id, paidByProfileId: input.paidByProfileId ?? null,
      source: input.source ?? "MANUAL", notes: input.notes ?? "", receiptId: input.receiptId ?? null, createdByProfileId: profileId,
    },
  });
  await audit({ profileId, action: "expense.create", entityType: "expense", entityId: e.id, summary: `${input.merchant || input.description} ${(input.amountCents / 100).toFixed(2)}` }, tx);
  return e;
}

export async function listExpenses(filter: { month?: string; categoryKey?: string; q?: string; limit?: number }) {
  const range = filter.month ? monthRange(filter.month) : null;
  return prisma.expense.findMany({
    where: {
      ...(range ? { date: { gte: range.start, lte: range.end } } : {}),
      ...(filter.categoryKey ? { category: { key: filter.categoryKey } } : {}),
      ...(filter.q ? { OR: [{ merchant: { contains: filter.q } }, { description: { contains: filter.q } }] } : {}),
    },
    include: { category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: filter.limit ?? 500,
  });
}

/** Category totals and budget for a month. All integer cents. */
export async function monthSummary(month: string) {
  const { start, end } = monthRange(month);
  const [cats, expenses, budgets] = await Promise.all([
    listCategories(),
    prisma.expense.groupBy({ by: ["categoryId"], where: { date: { gte: start, lte: end } }, _sum: { amountCents: true }, _count: true }),
    prisma.budget.findMany({ where: { month } }),
  ]);
  const rows = cats.map((c) => {
    const spent = expenses.find((e) => e.categoryId === c.id)?._sum.amountCents ?? 0;
    const budget = budgets.find((b) => b.categoryId === c.id)?.amountCents ?? null;
    return { id: c.id, key: c.key, name: c.name, color: c.color, spent, budget, count: expenses.find((e) => e.categoryId === c.id)?._count ?? 0 };
  });
  const total = rows.reduce((a, r) => a + r.spent, 0);
  const budgetTotal = rows.reduce((a, r) => a + (r.budget ?? 0), 0);
  return { month, rows, total, budgetTotal };
}

export async function monthlyTotals(endMonth: string, months = 6) {
  const out: { month: string; total: number; byCategory: Record<string, number> }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonthsToMonth(endMonth, -i);
    const { start, end } = monthRange(m);
    const rows = await prisma.expense.groupBy({ by: ["categoryId"], where: { date: { gte: start, lte: end } }, _sum: { amountCents: true } });
    const cats = await listCategories();
    const byCategory: Record<string, number> = {};
    for (const r of rows) byCategory[cats.find((c) => c.id === r.categoryId)?.key ?? "other"] = r._sum.amountCents ?? 0;
    out.push({ month: m, total: rows.reduce((a, r) => a + (r._sum.amountCents ?? 0), 0), byCategory });
  }
  return out;
}

export async function setBudget(categoryId: string, month: string, amountCents: number | null) {
  if (amountCents === null || amountCents <= 0) {
    await prisma.budget.deleteMany({ where: { categoryId, month } });
    return;
  }
  await prisma.budget.upsert({ where: { categoryId_month: { categoryId, month } }, create: { categoryId, month, amountCents }, update: { amountCents } });
}

export async function copyBudgets(fromMonth: string, toMonth: string) {
  const prev = await prisma.budget.findMany({ where: { month: fromMonth } });
  for (const b of prev) await setBudget(b.categoryId, toMonth, b.amountCents);
  return prev.length;
}
