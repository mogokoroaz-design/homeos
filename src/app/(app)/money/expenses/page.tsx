import { Trash2 } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listExpenses, listCategories } from "@/lib/finance/ledger";
import { formatCents, centsToInput } from "@/lib/money";
import { formatDate, monthOf, today } from "@/lib/dates";
import { Card, Badge, Input, Select, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { ExpenseDialog } from "@/components/money/forms";
import { deleteExpenseAction } from "../actions";

export const metadata = { title: "Ledger" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; category?: string; q?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const month = sp.month === "all" ? undefined : sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(today());
  const [expenses, cats, profiles] = await Promise.all([listExpenses({ month, categoryKey: sp.category || undefined, q: sp.q || undefined }), listCategories(), prisma.householdProfile.findMany({ select: { id: true, name: true } })]);
  const total = expenses.reduce((a, e) => a + e.amountCents, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <form className="flex flex-1 flex-wrap gap-2">
          <Input type="month" name="month" defaultValue={month ?? ""} className="w-44" aria-label="Month" />
          <Select name="category" defaultValue={sp.category ?? ""} className="w-48" aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select>
          <Input name="q" defaultValue={sp.q} placeholder="Search" className="w-48" />
          <button className="h-11 rounded-xl border border-line-strong px-4 text-sm">Filter</button>
        </form>
        <ExpenseDialog categories={cats} profiles={profiles} viewerId={viewer.profileId} />
      </div>
      <p className="text-sm text-muted">One shared household ledger · {expenses.length} entries · <span className="tabular text-ink">{formatCents(total, viewer.currency)}</span></p>
      {expenses.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="w-20 text-muted">{formatDate(e.date)}</span>
                <div className="min-w-40 flex-1"><p className="font-medium">{e.merchant || e.description || "Expense"}</p><p className="text-xs text-faint">{[e.merchant ? e.description : "", e.paidByProfileId ? `paid by ${profiles.find((p) => p.id === e.paidByProfileId)?.name}` : "", e.source !== "MANUAL" ? `from ${e.source.toLowerCase().replace("_", " ")}` : ""].filter(Boolean).join(" · ")}</p></div>
                <Badge>{e.category.name}</Badge>
                {e.receiptId ? <a href={`/money/receipts/${e.receiptId}`}><Badge tone="info">receipt</Badge></a> : null}
                <span className="w-24 text-right font-medium tabular">{formatCents(e.amountCents, viewer.currency)}</span>
                <ExpenseDialog categories={cats} profiles={profiles} viewerId={viewer.profileId} expense={{ id: e.id, date: e.date, amount: centsToInput(e.amountCents), merchant: e.merchant, description: e.description, category: e.category.key, paidBy: e.paidByProfileId }} />
                <InlineAction action={deleteExpenseAction} fields={{ id: e.id }} variant="ghost" size="iconSm" confirm="Delete this expense from the ledger?" title="Delete"><Trash2 className="h-4 w-4" /></InlineAction>
              </li>
            ))}
          </ul>
        </Card>
      ) : <Empty title="No expenses match">Add expenses manually, scan receipts, record bill payments or service visits — they all land here.</Empty>}
    </div>
  );
}
