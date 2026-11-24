import { Phone, Mail, Users, X } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { providersWithHistory } from "@/lib/home/services";
import { formatCents, centsToInput } from "@/lib/money";
import { formatDate, relativeDay, today } from "@/lib/dates";
import { Card, CardHeader, CardBody, Badge, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { ProviderDialog, ScheduleVisitDialog, CompleteVisitDialog } from "@/components/home/forms";
import { cancelVisitAction } from "../actions";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const viewer = await requireViewer();
  const [providers, profiles] = await Promise.all([providersWithHistory(), prisma.householdProfile.findMany({ select: { id: true, name: true } })]);
  const d = today();
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ProviderDialog /></div>
      {providers.length ? providers.map((p) => {
        const upcoming = p.visits.filter((v) => v.status === "SCHEDULED").sort((a, b) => a.date.localeCompare(b.date));
        const past = p.visits.filter((v) => v.status !== "SCHEDULED");
        const paid = past.reduce((a, v) => a + (v.paid ? v.paymentCents ?? 0 : 0), 0);
        return (
          <Card key={p.id}>
            <CardHeader title={<>{p.name} <Badge>{p.kind.toLowerCase()}</Badge></>} sub={<span className="flex flex-wrap gap-3">{p.phone ? <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone className="h-3.5 w-3.5" />{p.phone}</a> : null}{p.email ? <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail className="h-3.5 w-3.5" />{p.email}</a> : null}{p.rateCents ? <span>{formatCents(p.rateCents, viewer.currency)}/{p.rateUnit}</span> : null}</span>}
              action={<div className="flex gap-1"><ScheduleVisitDialog providerId={p.id} rate={centsToInput(p.rateCents)} /><ProviderDialog provider={{ id: p.id, name: p.name, kind: p.kind, phone: p.phone, email: p.email, notes: p.notes, rate: centsToInput(p.rateCents), rateUnit: p.rateUnit }} /></div>} />
            <CardBody className="space-y-4">
              {p.notes ? <p className="whitespace-pre-wrap rounded-xl bg-surface-2 px-4 py-3 text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-faint">Standing instructions</span>{p.notes}</p> : null}
              {upcoming.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-faint">Upcoming</p>
                  {upcoming.map((v) => (
                    <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-2.5">
                      <span className={v.date < d ? "text-warn" : ""}>{formatDate(v.date, { weekday: true })}{v.time ? ` · ${v.time}` : ""}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">{v.instructions}</span>
                      {v.paymentCents ? <span className="text-sm tabular text-muted">{formatCents(v.paymentCents, viewer.currency)}</span> : null}
                      <CompleteVisitDialog visit={{ id: v.id, date: v.date > d ? d : v.date, payment: centsToInput(v.paymentCents ?? p.rateCents), instructions: v.instructions }} profiles={profiles} viewerId={viewer.profileId} />
                      <InlineAction action={cancelVisitAction} fields={{ id: v.id }} variant="ghost" size="iconSm" confirm="Cancel this visit?" title="Cancel"><X className="h-4 w-4" /></InlineAction>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">History {paid ? `· ${formatCents(paid, viewer.currency)} paid` : ""}</p>
                {past.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {past.map((v) => (
                      <li key={v.id} className="flex flex-wrap gap-3 py-2">
                        <span className="w-28 text-muted">{relativeDay(v.date)}</span>
                        <span className="min-w-0 flex-1">{v.status === "CANCELLED" ? <span className="text-faint">Cancelled</span> : v.notes || "Completed"}</span>
                        {v.paymentCents ? <span className="tabular">{formatCents(v.paymentCents, viewer.currency)} {v.paid ? <Badge tone="accent">in ledger</Badge> : <Badge>unpaid</Badge>}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-faint">No visits recorded.</p>}
              </div>
            </CardBody>
          </Card>
        );
      }) : <Empty icon={<Users className="h-7 w-7" />} title="No service providers yet">Add your cleaner, gardener or trades. Visits go on the calendar; completed visits record payment in the shared ledger.</Empty>}
    </div>
  );
}
