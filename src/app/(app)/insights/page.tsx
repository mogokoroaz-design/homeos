import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import { spendingInsights, priceInsights, pantryInsights, homeInsights, personalInsights, projectInsights, budgetPerformance } from "@/lib/insights";
import { formatCents } from "@/lib/money";
import { formatMonth, formatDate } from "@/lib/dates";
import { unitPriceDisplay } from "@/lib/units";
import { Card, CardHeader, CardBody, Progress, PageHeader, Badge, SectionTitle, Stat } from "@/components/ui";
import { Bars, TrendLine } from "@/components/charts";

export const metadata = { title: "Insights" };

function NotEnough({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-faint">{children}</p>;
}

export default async function InsightsPage() {
  const viewer = await requireViewer();
  const [spend, prices, pantry, home, me, projects, budget] = await Promise.all([spendingInsights(), priceInsights(), pantryInsights(), homeInsights(), personalInsights(viewer), projectInsights(viewer), budgetPerformance()]);
  const money = (c: number) => formatCents(c, viewer.currency);
  const mtdDiff = spend.current.total - spend.monthToDatePrevCents;
  return (
    <>
      <PageHeader title="Insights" sub="Everything here is computed from what you have recorded. Where there isn't enough data, it says so — no extrapolated trends or health conclusions." />

      <SectionTitle>Household money</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><Stat label={`${formatMonth(spend.current.month)} so far`} value={money(spend.current.total)} sub={spend.monthToDatePrevCents || spend.current.total ? `${mtdDiff >= 0 ? "+" : "−"}${money(Math.abs(mtdDiff))} vs same point last month` : undefined} /></Card>
        <Card className="p-4"><Stat label="Budget used" value={budget.budgetTotal ? `${Math.round((budget.total / budget.budgetTotal) * 100)}%` : "—"} sub={budget.budgetTotal ? `${Math.round(budget.elapsed * 100)}% of the month elapsed` : "no budgets set"} tone={budget.budgetTotal && budget.total / budget.budgetTotal > budget.elapsed + 0.1 ? "warn" : undefined} /></Card>
        <Card className="p-4"><Stat label="Groceries this month" value={money(spend.groceries.at(-1)?.cents ?? 0)} sub={`last month ${money(spend.groceries.at(-2)?.cents ?? 0)}`} /></Card>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly spending" sub="Last 12 months" />
          <CardBody>{spend.hasData ? <Bars data={spend.trend.map((t) => ({ month: t.month, total: t.total }))} x="month" xFmt="month" fmt="money" currency={viewer.currency} series={[{ key: "total", name: "Spending" }]} /> : <NotEnough>No expenses recorded yet.</NotEnough>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Budget performance" sub={formatMonth(budget.month)} />
          <CardBody className="space-y-3">
            {budget.rows.filter((r) => r.budget).length ? budget.rows.filter((r) => r.budget).map((r) => (
              <div key={r.key}>
                <div className="flex justify-between text-sm"><span>{r.name}</span><span className="tabular text-muted">{money(r.spent)} / {money(r.budget!)}</span></div>
                <Progress value={r.spent} max={r.budget!} tone={r.spent > r.budget! ? "danger" : r.spent / r.budget! > budget.elapsed + 0.1 ? "warn" : "accent"} className="mt-1.5" />
              </div>
            )) : <NotEnough>Set budgets on Money → Budgets to track performance.</NotEnough>}
          </CardBody>
        </Card>
      </div>

      <SectionTitle>Grocery prices</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Prices that went up" sub="Recorded purchases only — not live market prices" />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {prices.increases.map((c) => { const u = unitPriceDisplay(c.latest, c.normalizedUnit); return <li key={c.productId + c.variant}><Link href={`/money/prices?product=${c.productId}`} className="flex justify-between px-5 py-2.5 hover:bg-surface-2"><span>{c.product} <span className="text-faint">{c.variant}</span></span><span className="tabular"><span className="text-warn">+{c.changePct.toFixed(1)}%</span> <span className="text-muted">· {money(Math.round(u.value))}/{u.label}</span></span></Link></li>; })}
            {!prices.increases.length ? <li className="px-5 py-4"><NotEnough>Needs two or more recorded prices for the same product option.</NotEnough></li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Switching opportunities" sub="Last 90 days of purchases vs cheapest recorded option" />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {prices.savings.map((s) => <li key={s.productId + s.normalizedUnit}><Link href={`/money/prices?product=${s.productId}`} className="flex justify-between px-5 py-2.5 hover:bg-surface-2"><span>{s.product} <span className="text-faint">→ {s.cheapest}</span></span><span className="tabular text-accent">save {money(s.potentialSavingsCents)}</span></Link></li>)}
            {!prices.savings.length ? <li className="px-5 py-4"><NotEnough>Needs purchases of at least two brands or sizes of a product.</NotEnough></li> : null}
          </ul>
        </Card>
      </div>

      <SectionTitle>Food & pantry</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Wasted items" sub="Pantry items discarded per month" />
          <CardBody>{pantry.total ? <Bars data={pantry.series} x="month" xFmt="month" series={[{ key: "events", name: "Items discarded" }]} height={180} /> : <NotEnough>No waste recorded. Use the bin icon in the Pantry when food is thrown out.</NotEnough>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Most often wasted" sub={pantry.expiredNow.length ? `${pantry.expiredNow.length} item(s) currently past their date` : undefined} />
          <CardBody className="space-y-1.5 text-sm">{pantry.topWasted.length ? pantry.topWasted.map((w) => <div key={w.name} className="flex justify-between"><span>{w.name}</span><span className="tabular text-muted">{w.count}×</span></div>) : <NotEnough>Nothing yet.</NotEnough>}</CardBody>
        </Card>
      </div>

      <SectionTitle>Home</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Task completion" sub="Last 4 weeks, by category" />
          <CardBody className="space-y-3">
            {home.categories.filter((c) => c.expected || c.done).length ? home.categories.filter((c) => c.expected || c.done).map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm"><span>{c.category[0] + c.category.slice(1).toLowerCase()}</span><span className="tabular text-muted">{c.done} done / {c.expected} due{c.skipped ? ` · ${c.skipped} skipped` : ""}</span></div>
                {c.rate !== null ? <Progress value={c.rate * 100} max={100} tone={c.rate < 0.5 ? "warn" : "accent"} className="mt-1.5" /> : null}
              </div>
            )) : <NotEnough>No household tasks were due in the last 4 weeks.</NotEnough>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Service visits" sub="Last 90 days" />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {home.visits.map((v, i) => <li key={i} className="flex justify-between px-5 py-2"><span>{formatDate(v.date)} · {v.provider} <span className="text-faint">{v.kind.toLowerCase()}</span></span><span className="text-muted">{v.status.toLowerCase()}{v.paymentCents ? ` · ${money(v.paymentCents)}` : ""}</span></li>)}
            {!home.visits.length ? <li className="px-5 py-4"><NotEnough>No visits recorded.</NotEnough></li> : null}
          </ul>
        </Card>
      </div>

      <SectionTitle><span className="inline-flex items-center gap-2">My wellness <Badge>private to {viewer.name}</Badge></span></SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calories logged" sub={me.loggedDays ? `${me.loggedDays} of the last 30 days logged · average ${me.avgKcal} kcal on logged days` : "Last 30 days"} />
          <CardBody>{me.loggedDays ? <TrendLine data={me.nutrition.map((n) => ({ date: n.date, kcal: n.logged ? n.kcal : null }))} x="date" xFmt="date" fmt="kcal" series={[{ key: "kcal", name: "Calories" }]} reference={me.nutrition.at(-1)?.target} referenceLabel="target" height={200} /> : <NotEnough>No food logged in the last 30 days.</NotEnough>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Weight" sub="Last 6 months" />
          <CardBody>{me.weights.length > 1 ? <TrendLine data={me.weights.map((w) => ({ date: w.date, kg: w.value }))} x="date" xFmt="date" fmt="kg" series={[{ key: "kg", name: "Weight" }]} height={200} /> : <NotEnough>Log weight at least twice to see a trend.</NotEnough>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Exercise consistency" sub={`${me.weeks.filter((w) => w.sessions).length} of the last 12 weeks active`} />
          <CardBody>{me.weeks.some((w) => w.sessions) ? <Bars data={me.weeks} x="week" xFmt="date" series={[{ key: "sessions", name: "Sessions" }]} height={180} /> : <NotEnough>No workouts logged.</NotEnough>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Habits" sub="Last 4 weeks vs your weekly target" />
          <CardBody className="space-y-3">{me.habits.length ? me.habits.map((h) => <div key={h.name}><div className="flex justify-between text-sm"><span>{h.name}</span><span className="tabular text-muted">{h.done}/{h.target}</span></div><Progress value={h.done} max={h.target} className="mt-1.5" /></div>) : <NotEnough>No habits.</NotEnough>}</CardBody>
        </Card>
      </div>

      <SectionTitle>Projects</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="My projects" sub="Last 30 days · private" />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {projects.own.map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="flex justify-between px-5 py-2.5 hover:bg-surface-2"><span>{p.name}</span><span className="tabular text-muted">{p.entries30} entries · {p.activeDays} active days</span></Link></li>)}
            {!projects.own.length ? <li className="px-5 py-4"><NotEnough>No projects.</NotEnough></li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Shared project summaries" sub="Aggregate numbers members chose to share — never entry content" />
          <CardBody className="space-y-4">
            {projects.shared.length ? projects.shared.map((s) => (
              <div key={s.integrationId}>
                <p className="mb-1 text-sm"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: s.ownerColor }} />{s.owner} · {s.label}</p>
                <Bars data={s.series} x="week" xFmt="date" series={[{ key: "value", name: s.label }]} height={130} />
              </div>
            )) : <NotEnough>No approved summaries. Share one from a project&apos;s Integrations panel.</NotEnough>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
