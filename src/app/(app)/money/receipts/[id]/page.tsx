import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listCategories } from "@/lib/finance/ledger";
import { parseReceiptText } from "@/lib/finance/receipt-parser";
import { toReviewData } from "@/lib/finance/review";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { ReceiptReview } from "@/components/money/receipt-review";
import { discardReceiptAction, rerunOcrAction } from "../../actions";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const r = await prisma.receipt.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!r) notFound();
  if (r.status !== "PENDING_REVIEW") {
    return (
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <img src={`/api/files/${r.fileId}`} alt="Receipt" className="w-full rounded-xl border border-line" />
        <Card>
          <CardHeader title={r.merchant || "Receipt"} sub={`${r.date ? formatDate(r.date, { year: true }) : ""} · ${formatCents(r.totalCents, viewer.currency)}${r.paymentNote ? ` · ${r.paymentNote}` : ""}`} action={<Badge tone={r.status === "SAVED" ? "accent" : "neutral"}>{r.status.toLowerCase()}</Badge>} />
          <ul className="divide-y divide-line border-t border-line text-sm">
            {r.items.map((i) => <li key={i.id} className="flex justify-between px-5 py-2"><span>{i.name} {i.quantity !== 1 ? <span className="text-faint">× {i.quantity} {i.unit}</span> : null}{i.addToPantry ? <Badge className="ml-2" tone="info">pantry</Badge> : null}</span><span className="tabular">{formatCents(i.totalCents, viewer.currency)}</span></li>)}
          </ul>
          {r.status === "SAVED" ? <p className="border-t border-line px-5 py-3 text-sm text-accent">{r.expenseId ? "Saved to the household ledger" : "Saved (no expense created)"}{r.items.some((i) => i.productVariantId) ? " · prices added to history" : ""}{r.items.some((i) => i.addToPantry) ? " · pantry updated" : ""}</p> : null}
          <div className="flex gap-2 p-4">{r.expenseId ? <LinkButton href="/money/expenses" size="sm">Ledger</LinkButton> : null}<LinkButton href="/money/prices" size="sm" variant="ghost">Prices</LinkButton></div>
        </Card>
      </div>
    );
  }
  const [cats, profiles] = await Promise.all([listCategories(), prisma.householdProfile.findMany({ select: { id: true, name: true } })]);
  const warnings = parseReceiptText(r.ocrText).warnings;
  if (r.ocrConfidence !== null && r.ocrConfidence < 60) warnings.unshift(`OCR confidence was low (${Math.round(r.ocrConfidence)}%) — check every line.`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Review receipt</h2><Badge tone="warn">not saved yet</Badge>
        <div className="ml-auto flex gap-2">
          <InlineAction action={rerunOcrAction} fields={{ id }} variant="ghost">Re-run OCR</InlineAction>
          <InlineAction action={discardReceiptAction} fields={{ id }} variant="ghost" confirm="Discard this draft? The image is kept for reference.">Discard</InlineAction>
        </div>
      </div>
      <ReceiptReview receiptId={id} initial={toReviewData(r)} categories={cats.map((c) => ({ key: c.key, name: c.name }))} profiles={profiles} viewerId={viewer.profileId} currency={viewer.currency} imageUrl={`/api/files/${r.fileId}`} ocrText={r.ocrText} warnings={warnings} />
    </div>
  );
}
