// Insights are computed only from recorded data. When there is not enough data, the
// result says so instead of extrapolating. No health conclusions are generated.
import { prisma } from "./db";
import type { Viewer } from "./auth/session";
import { addDays, today, startOfWeek, monthOf, addMonthsToMonth, monthRange } from "./dates";
import { occurrences } from "./recurrence";
import { monthlyTotals, monthSummary } from "./finance/ledger";
import { priceChanges, brandSwitchSavings } from "./finance/prices";
import { nutritionTrend } from "./food/foodlog";
import { approvedProjectSummaries } from "./projects/projects";

export async function spendingInsights() {
  const month = monthOf(today());
  const [trend, current, previous] = await Promise.all([monthlyTotals(month, 12), monthSummary(month), monthSummary(addMonthsToMonth(month, -1))]);
  const dayOfMonth = Number(today().slice(8, 10));
  const prevSameDays = await prisma.expense.aggregate({ where: { date: { gte: `${addMonthsToMonth(month, -1)}-01`, lte: `${addMonthsToMonth(month, -1)}-${String(dayOfMonth).padStart(2, "0")}` } }, _sum: { amountCents: true } });
  const groceries = trend.map((t) => ({ month: t.month, cents: t.byCategory.groceries ?? 0 }));
  return { trend, current, previous, monthToDatePrevCents: prevSameDays._sum.amountCents ?? 0, groceries, hasData: trend.some((t) => t.total > 0) };
}

export async function priceInsights() {
  const [changes, savings] = await Promise.all([priceChanges(365), brandSwitchSavings(90)]);
  return { increases: changes.filter((c) => c.changePct > 0.5).slice(0, 10), decreases: changes.filter((c) => c.changePct < -0.5).slice(0, 10), savings: savings.slice(0, 10) };
}

export async function pantryInsights(months = 6) {
  const since = `${addMonthsToMonth(monthOf(today()), -(months - 1))}-01`;
  const waste = await prisma.inventoryTransaction.findMany({ where: { reason: "WASTE", createdAt: { gte: new Date(since + "T00:00:00") } } });
  const byMonth = new Map<string, number>();
  const byItem = new Map<string, number>();
  for (const w of waste) {
    const m = w.createdAt.toISOString().slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    byItem.set(w.name, (byItem.get(w.name) ?? 0) + 1);
  }
  const expired = await prisma.pantryItem.findMany({ where: { quantity: { gt: 0 }, expiryDate: { lt: today() } } });
  const series = Array.from({ length: months }, (_, i) => {
    const m = addMonthsToMonth(monthOf(today()), -(months - 1 - i));
    return { month: m, events: byMonth.get(m) ?? 0 };
  });
  return { series, topWasted: [...byItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count })), expiredNow: expired, total: waste.length };
}

/** Completion rate of recurring/one-off home tasks per category over the last N days. */
export async function homeInsights(days = 28) {
  const from = addDays(today(), -days);
  const to = addDays(today(), -1);
  const tasks = await prisma.householdTask.findMany({ where: { active: true }, include: { schedule: true, completions: { where: { completedAt: { gte: new Date(from + "T00:00:00") } } } } });
  const cats: Record<string, { expected: number; done: number; skipped: number }> = {};
  for (const t of tasks) {
    const c = (cats[t.category] ??= { expected: 0, done: 0, skipped: 0 });
    const expected = t.schedule ? occurrences(t.schedule, from, to).length : t.dueDate && t.dueDate >= from && t.dueDate <= to ? 1 : 0;
    c.expected += expected;
    c.done += t.completions.filter((x) => !x.skipped).length;
    c.skipped += t.completions.filter((x) => x.skipped).length;
  }
  const visits = await prisma.serviceVisit.findMany({ where: { date: { gte: addDays(today(), -90) } }, include: { provider: true }, orderBy: { date: "asc" } });
  return {
    categories: Object.entries(cats).map(([category, v]) => ({ category, ...v, rate: v.expected ? Math.min(1, v.done / v.expected) : null })),
    visits: visits.map((v) => ({ date: v.date, provider: v.provider.name, kind: v.provider.kind, status: v.status, paymentCents: v.paymentCents })),
  };
}

export async function personalInsights(viewer: Pick<Viewer, "profileId">) {
  const me = viewer.profileId;
  const weights = await prisma.wellnessMetric.findMany({ where: { profileId: me, type: "WEIGHT", date: { gte: addDays(today(), -180) } }, orderBy: { date: "asc" } });
  const workouts = await prisma.workout.findMany({ where: { profileId: me, date: { gte: addDays(startOfWeek(today()), -7 * 11) } } });
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const ws = addDays(startOfWeek(today()), -7 * (11 - i));
    const inWeek = workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6));
    return { week: ws, sessions: inWeek.length, minutes: inWeek.reduce((a, w) => a + w.durationMin, 0) };
  });
  const nutrition = await nutritionTrend(viewer, me, today(), 30);
  const loggedDays = nutrition.filter((n) => n.logged);
  const habits = await prisma.habit.findMany({ where: { profileId: me, active: true }, include: { logs: { where: { date: { gte: addDays(today(), -27) } } } } });
  return {
    weights: [...new Map(weights.map((w) => [w.date, { date: w.date, value: w.value }])).values()],
    weeks,
    nutrition,
    avgKcal: loggedDays.length ? Math.round(loggedDays.reduce((a, n) => a + n.kcal, 0) / loggedDays.length) : null,
    loggedDays: loggedDays.length,
    habits: habits.map((h) => ({ name: h.name, done: h.logs.length, target: Math.round((h.targetPerWeek * 28) / 7) })),
  };
}

export async function projectInsights(viewer: Pick<Viewer, "profileId">) {
  const own = await prisma.project.findMany({ where: { ownerProfileId: viewer.profileId, archived: false }, include: { entries: { where: { date: { gte: addDays(today(), -29) } }, select: { date: true } } } });
  return { own: own.map((p) => ({ id: p.id, name: p.name, entries30: p.entries.length, activeDays: new Set(p.entries.map((e) => e.date)).size })), shared: await approvedProjectSummaries(8) };
}

export async function budgetPerformance(month = monthOf(today())) {
  const s = await monthSummary(month);
  const { start, end } = monthRange(month);
  const elapsed = Math.min(1, (Number(today() > end ? end.slice(8) : today().slice(8)) || 1) / Number(end.slice(8)));
  return { ...s, start, end, elapsed, rows: s.rows.filter((r) => r.budget || r.spent) };
}
