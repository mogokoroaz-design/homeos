import { Archive, Receipt } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listBills, billState } from "@/lib/finance/bills";
import { listCategories } from "@/lib/finance/ledger";
import { describeSchedule } from "@/lib/recurrence";
import { formatCents, centsToInput } from "@/lib/money";
import { formatDate, relativeDay } from "@/lib/dates";
import { Card, Badge, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { BillDialog, PayBillDialog } from "@/components/money/forms";
import { ImageUpload } from "@/components/food/image-upload";
import { archiveBillAction } from "../actions";

export const metadata = { title: "Bills" };
const TONE = { overdue: "danger", "due-soon": "warn", upcoming: "neutral", paid: "accent" } as const;

export default async function BillsPage() {
  const viewer = await requireViewer();
  const [bills, cats, profiles] = await Promise.all([listBills(), listCategories(), prisma.householdProfile.findMany({ select: { id: true, name: true } })]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted">Bills are tracked and reminded — never paid automatically.</p><BillDialog categories={cats} /></div>
      {bills.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {bills.map((b) => {
              const st = billState(b);
              return (
                <li key={b.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">{b.name} <span className="font-normal text-muted">{b.provider}</span></p>
                      <p className="text-xs text-faint">{b.category.name} · {describeSchedule(b.schedule)} · reminder {b.remindDaysBefore} day(s) before</p>
                    </div>
                    <Badge tone={TONE[st]}>{st === "paid" ? "paid" : `${st.replace("-", " ")} · ${relativeDay(b.dueDate).toLowerCase()}`}</Badge>
                    <span className="w-24 text-right font-medium tabular">{formatCents(b.amountCents, viewer.currency)}</span>
                    {st !== "paid" ? <PayBillDialog bill={{ id: b.id, name: b.name, amount: centsToInput(b.amountCents) }} profiles={profiles} viewerId={viewer.profileId} /> : null}
                    <InlineAction action={archiveBillAction} fields={{ id: b.id }} variant="ghost" size="iconSm" confirm="Stop tracking this bill?" title="Archive"><Archive className="h-4 w-4" /></InlineAction>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {b.payments.length ? <span>Paid: {b.payments.slice(0, 4).map((p) => `${formatDate(p.paidDate)} ${formatCents(p.amountCents, viewer.currency)}`).join(" · ")}</span> : <span className="text-faint">No payments recorded</span>}
                    {b.attachments.map((a) => <a key={a.id} href={`/api/files/${a.fileId}`} target="_blank" className="text-info underline">{a.file.originalName}</a>)}
                    <BillAttach id={b.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : <Empty icon={<Receipt className="h-7 w-7" />} title="No bills yet">Add rent, utilities, internet and subscriptions with their schedules to get reminders on Today and the calendar.</Empty>}
    </div>
  );
}

function BillAttach({ id }: { id: string }) {
  return <ImageUpload endpoint={`/api/bills/${id}/attachments`} label="Attach image" />;
}
