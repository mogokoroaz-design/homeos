import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { monthSummary, monthlyTotals, listCategories, listExpenses } from "@/lib/finance/ledger";
import { billOccurrences } from "@/lib/finance/bills";
import { today, monthOf, addDays, addMonthsToMonth, formatMonth, relativeDay, formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardHeader, CardBody, Stat, Progress, Badge, LinkButton } from "@/components/ui";
import { Bars } from "@/components/charts";
import { ExpenseDialog } from "@/components/money/forms";

export const metadata = { title: "Money" };

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today());
  const [sum, prev, trend, cats, profiles, bills, recent, recurring] = await Promise.all([
    monthSummary(month), monthSummary(addMonthsToMonth(month, -1)), monthlyTotals(month, 6), listCategories(),
    prisma.householdProfile.findMany({ select: { id: true, name: true } }), billOccurrences(addDays(today(), -60), addDays(today(), 30)),
    listExpenses({ month, limit: 8 }), prisma.bill.findMany({ where: { active: true, scheduleId: { not: null } }, include: { schedule: true } }),
  ]);
  const unpaid = bills.filter((b) => b.status !== "PAID" && !b.projected);
  const monthlyRecurring = recurring.reduce((a, b) => a + (b.schedule?.freq === "MONTHLY" ? b.amountCents / (b.schedule.interval || 1) : b.schedule?.freq === "WEEKLY" ? (b.amountCents * 52) / 12 : b.schedule?.freq === "YEARLY" ? b.amountCents / 12 : 0), 0);
  const top = sum.rows.filter((r) => r.spent || r.budget).sort((a, b) => b.spent - a.spent);
  const trendCats = [...new Set(trend.flatMap((t) => Object.entries(t.byCategory).filter(([, v]) => v > 0).map(([k]) => k)))]
    .sort((a, b) => trend.reduce((s, t) => s + (t.byCategory[b] ?? 0), 0) - trend.reduce((s, t) => s + (t.byCategory[a] ?? 0), 0));
  const shown = trendCats.slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={`/money?month=${addMonthsToMonth(month, -1)}`} size="sm" variant="ghost">←</LinkButton>
        <h2 className="min-w-28 text-center text-lg font-semibold">{formatMonth(month)}</h2>
        <LinkButton href={`/money?month=${addMonthsToMonth(month, 1)}`} size="sm" variant="ghost">→</LinkButton>
        <div className="ml-auto flex gap-2"><LinkButton href="/money/receipts">Scan receipt</LinkButton><ExpenseDialog categories={cats} profiles={profiles} viewerId={viewer.profileId} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><Stat label="Spent this month" value={formatCents(sum.total, viewer.currency)} sub={`last month ${formatCents(prev.total, viewer.currency)}`} /></Card>
        <Card className="p-4"><Stat label="Budgeted" value={sum.budgetTotal ? formatCents(sum.budgetTotal, viewer.currency) : "—"} tone={sum.budgetTotal && sum.total > sum.budgetTotal ? "danger" : undefined} sub={sum.budgetTotal ? `${formatCents(sum.budgetTotal - sum.total, viewer.currency)} left` : <Link href="/money/budgets" className="text-info">set budgets</Link>} /></Card>
        <Card className="p-4"><Stat label="Unpaid bills" value={unpaid.length} tone={unpaid.some((b) => b.date < today()) ? "danger" : undefined} sub={unpaid.length ? formatCents(unpaid.reduce((a, b) => a + b.amountCents, 0), viewer.currency) : "all clear"} /></Card>
        <Card className="p-4"><Stat label="Recurring bills / month" value={formatCents(Math.round(monthlyRecurring), viewer.currency)} sub={`${recurring.length} recurring`} /></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Spending trend" sub="Last 6 months, top categories (others grouped)" />
          <CardBody>
            {trend.some((t) => t.total) ? (
              <Bars stacked fmt="money" currency={viewer.currency} xFmt="month" x="month" height={240}
                data={trend.map((t) => ({ month: t.month, ...Object.fromEntries(shown.map((k) => [k, t.byCategory[k] ?? 0])), other: Object.entries(t.byCategory).filter(([k]) => !shown.includes(k)).reduce((a, [, v]) => a + v, 0) }))}
                series={[...shown.map((k) => ({ key: k, name: cats.find((c) => c.key === k)?.name ?? k })), ...(trendCats.length > 5 ? [{ key: "other", name: "Other", color: "#5d6470" }] : [])]} />
            ) : <p className="text-sm text-muted">No expenses recorded yet.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Budget vs actual" action={<LinkButton href="/money/budgets" size="sm" variant="ghost">Edit</LinkButton>} />
          <CardBody className="space-y-3">
            {top.length ? top.map((r) => (
              <div key={r.id}>
                <div className="flex justify-between text-sm"><Link href={`/money/expenses?month=${month}&category=${r.key}`} className="hover:underline">{r.name}</Link><span className="tabular text-muted">{formatCents(r.spent, viewer.currency)}{r.budget ? ` / ${formatCents(r.budget, viewer.currency)}` : ""}</span></div>
                {r.budget ? <Progress value={r.spent} max={r.budget} tone={r.spent > r.budget ? "danger" : r.spent > r.budget * 0.85 ? "warn" : "accent"} className="mt-1.5" /> : null}
              </div>
            )) : <p className="text-sm text-muted">Nothing yet this month.</p>}
          </CardBody>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent expenses" action={<LinkButton href={`/money/expenses?month=${month}`} size="sm" variant="ghost">Ledger</LinkButton>} />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {recent.map((e) => <li key={e.id} className="flex items-center gap-3 px-5 py-2.5"><span className="w-16 text-muted">{formatDate(e.date)}</span><span className="min-w-0 flex-1 truncate">{e.merchant || e.description}</span><Badge>{e.category.name}</Badge><span className="w-20 text-right tabular">{formatCents(e.amountCents, viewer.currency)}</span></li>)}
            {!recent.length ? <li className="px-5 py-4 text-faint">No expenses this month.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Bills & reminders" action={<LinkButton href="/money/bills" size="sm" variant="ghost">Bills</LinkButton>} />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {bills.filter((b) => b.status !== "PAID").slice(0, 8).map((b) => <li key={b.billId + b.date} className="flex items-center gap-3 px-5 py-2.5"><span className="flex-1">{b.name}{b.projected ? <span className="text-faint"> (projected)</span> : null}</span><span className={b.date < today() ? "text-danger" : "text-muted"}>{relativeDay(b.date)}</span><span className="w-20 text-right tabular">{formatCents(b.amountCents, viewer.currency)}</span></li>)}
            {!bills.length ? <li className="px-5 py-4 text-faint">No bills tracked.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
