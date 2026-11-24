import { Wrench } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, today, addDays } from "@/lib/dates";
import { Card, CardHeader, Badge, Empty, SectionTitle } from "@/components/ui";
import { AssetDialog, MaintenanceDialog } from "@/components/home/forms";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const viewer = await requireViewer();
  const [assets, records, providers] = await Promise.all([
    prisma.homeAsset.findMany({ include: { records: { orderBy: { date: "desc" }, take: 3 } }, orderBy: { name: "asc" } }),
    prisma.maintenanceRecord.findMany({ include: { asset: true, provider: true }, orderBy: { date: "desc" }, take: 50 }),
    prisma.serviceProvider.findMany({ select: { id: true, name: true } }),
  ]);
  const d = today();
  const due = records.filter((r) => r.nextDueDate && r.nextDueDate <= addDays(d, 30));
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2"><AssetDialog /><MaintenanceDialog assets={assets.map((a) => ({ id: a.id, name: a.name }))} providers={providers} /></div>
      {due.length ? <Card className="border-warn/30 p-4 text-sm"><p className="font-medium text-warn">Service due within 30 days</p>{due.map((r) => <p key={r.id} className="mt-1">{r.title}{r.asset ? ` (${r.asset.name})` : ""} — {formatDate(r.nextDueDate!)}</p>)}</Card> : null}
      <SectionTitle>Appliances & warranties</SectionTitle>
      {assets.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => {
            const active = a.warrantyUntil && a.warrantyUntil >= d;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{a.name}</p><p className="text-xs text-faint">{[a.brand, a.model, a.location].filter(Boolean).join(" · ")}</p></div>
                  <AssetDialog asset={{ id: a.id, name: a.name, location: a.location, brand: a.brand, model: a.model, purchaseDate: a.purchaseDate, warrantyUntil: a.warrantyUntil, notes: a.notes }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.warrantyUntil ? <Badge tone={active ? "accent" : "neutral"}>{active ? "warranty to" : "warranty ended"} {formatDate(a.warrantyUntil, { year: true })}</Badge> : <Badge>no warranty info</Badge>}
                  {a.purchaseDate ? <Badge>bought {formatDate(a.purchaseDate, { year: true })}</Badge> : null}
                </div>
                {a.records.length ? <p className="mt-2 text-xs text-muted">Last: {a.records[0].title} ({formatDate(a.records[0].date)})</p> : null}
                {a.notes ? <p className="mt-2 text-xs text-faint">{a.notes}</p> : null}
              </Card>
            );
          })}
        </div>
      ) : <p className="text-sm text-faint">No appliances recorded.</p>}
      <SectionTitle>Maintenance history</SectionTitle>
      {records.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="w-28 text-muted">{formatDate(r.date, { year: true })}</span>
                <div className="min-w-48 flex-1"><p className="font-medium">{r.title}</p><p className="text-xs text-faint">{r.kind.toLowerCase()}{r.asset ? ` · ${r.asset.name}` : ""}{r.provider ? ` · ${r.provider.name}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p></div>
                {r.nextDueDate ? <Badge tone="info">next {formatDate(r.nextDueDate)}</Badge> : null}
                {r.costCents ? <span className="tabular">{formatCents(r.costCents, viewer.currency)}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : <Empty icon={<Wrench className="h-7 w-7" />} title="No maintenance recorded">Log repairs, plumbing and electrical work. Costs can go straight into the ledger.</Empty>}
    </div>
  );
}
