import { requireViewer } from "@/lib/auth/session";
import { monthSummary } from "@/lib/finance/ledger";
import { today, monthOf, addMonthsToMonth, formatMonth } from "@/lib/dates";
import { formatCents, centsToInput } from "@/lib/money";
import { Card, Progress, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { AutoSubmitInput } from "@/components/auto-submit";
import { setBudgetAction, copyBudgetsAction, updateCategoryAction } from "../actions";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today());
  const s = await monthSummary(month);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={`/money/budgets?month=${addMonthsToMonth(month, -1)}`} size="sm" variant="ghost">←</LinkButton>
        <h2 className="min-w-28 text-center text-lg font-semibold">{formatMonth(month)}</h2>
        <LinkButton href={`/money/budgets?month=${addMonthsToMonth(month, 1)}`} size="sm" variant="ghost">→</LinkButton>
        <div className="ml-auto"><InlineAction action={copyBudgetsAction} fields={{ from: addMonthsToMonth(month, -1), to: month }} variant="secondary" size="md">Copy last month&apos;s budgets</InlineAction></div>
      </div>
      <Card>
        <div className="grid grid-cols-[1fr_120px_140px] gap-3 border-b border-line px-5 py-2 text-xs font-semibold uppercase tracking-wider text-faint sm:grid-cols-[200px_1fr_120px_160px]"><span>Category</span><span className="hidden sm:block">Progress</span><span className="text-right">Spent</span><span>Budget</span></div>
        <ul className="divide-y divide-line">
          {s.rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_120px_140px] items-center gap-3 px-5 py-2.5 sm:grid-cols-[200px_1fr_120px_160px]">
              <form action={updateCategoryAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <AutoSubmitInput name="name" defaultValue={r.name} aria-label="Category name" className="w-full bg-transparent text-sm outline-none focus:underline" />
              </form>
              <div className="hidden sm:block">{r.budget ? <Progress value={r.spent} max={r.budget} tone={r.spent > r.budget ? "danger" : r.spent > r.budget * 0.85 ? "warn" : "accent"} /> : null}</div>
              <span className="text-right text-sm tabular">{formatCents(r.spent, viewer.currency)}</span>
              <form action={setBudgetAction} className="flex items-center gap-1.5">
                <input type="hidden" name="categoryId" value={r.id} />
                <input type="hidden" name="month" value={month} />
                <input name="amount" defaultValue={centsToInput(r.budget)} placeholder="no budget" inputMode="decimal" aria-label={`${r.name} budget`} className="h-9 w-24 rounded-lg border border-line-strong bg-surface-2 px-2 text-right text-sm tabular outline-none focus:border-accent/70" />
                <button className="h-9 rounded-lg border border-line-strong px-2.5 text-xs hover:bg-surface-3">Set</button>
              </form>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-line px-5 py-3 text-sm"><span className="text-muted">Total</span><span className="tabular">{formatCents(s.total, viewer.currency)} / {formatCents(s.budgetTotal, viewer.currency)}</span></div>
      </Card>
    </div>
  );
}
