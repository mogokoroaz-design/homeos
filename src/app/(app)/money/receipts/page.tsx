import Link from "next/link";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { ReceiptUpload } from "@/components/money/forms";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const viewer = await requireViewer();
  const receipts = await prisma.receipt.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { _count: { select: { items: true } } } });
  return (
    <div className="space-y-5">
      <ReceiptUpload />
      <SectionTitle>Receipts & bills</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {receipts.map((r) => (
          <Link key={r.id} href={`/money/receipts/${r.id}`}>
            <Card className="flex gap-3 p-3 hover:border-line-strong">
              <img src={`/api/files/${r.fileId}`} alt="" className="h-20 w-16 rounded-lg border border-line object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.merchant || "Unknown merchant"}</p>
                <p className="text-xs text-muted">{r.date ? formatDate(r.date, { year: true }) : "no date"} · {r._count.items} items</p>
                <p className="mt-1 tabular">{formatCents(r.totalCents, viewer.currency)}</p>
                <Badge tone={r.status === "SAVED" ? "accent" : r.status === "DISCARDED" ? "neutral" : "warn"} className="mt-1">{r.status === "PENDING_REVIEW" ? "needs review" : r.status.toLowerCase()}</Badge>
              </div>
            </Card>
          </Link>
        ))}
        {!receipts.length ? <p className="text-sm text-faint">No receipts yet.</p> : null}
      </div>
    </div>
  );
}
