import { Refrigerator, Trash2 } from "lucide-react";
import { listPantry, lowStock } from "@/lib/food/pantry";
import { prisma } from "@/lib/db";
import { today, relativeDay, addDays } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { Card, CardHeader, Badge, Empty, Input, SectionTitle } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { ConversationalPantry, AddPantryForm, EditPantryDialog } from "@/components/food/pantry-tools";
import { setPantryQtyAction, wastePantryAction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pantry" };
const LOCS = [["FRIDGE", "Fridge"], ["FREEZER", "Freezer"], ["PANTRY", "Pantry"], ["OTHER", "Other"]] as const;

export default async function PantryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [items, low, history] = await Promise.all([
    listPantry({ q }),
    lowStock(),
    prisma.inventoryTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const d = today();
  return (
    <div className="space-y-5">
      <Card className="p-4"><ConversationalPantry /></Card>
      <Card className="p-4"><AddPantryForm /></Card>
      {low.length ? <div className="flex flex-wrap gap-2 text-sm"><span className="text-warn">Low stock:</span>{low.map((l) => <Badge key={l.name} tone="warn">{l.name} · {formatQuantity(l.quantity, l.unit)}</Badge>)}</div> : null}
      <form><Input name="q" defaultValue={q} placeholder="Search pantry" className="max-w-xs" /></form>
      {items.length ? LOCS.map(([loc, label]) => {
        const list = items.filter((i) => i.location === loc);
        if (!list.length) return null;
        return (
          <Card key={loc}>
            <CardHeader title={label} sub={`${list.length} item(s)`} />
            <ul className="divide-y divide-line border-t border-line">
              {list.map((it) => {
                const expired = it.expiryDate && it.expiryDate < d;
                const soon = it.expiryDate && !expired && it.expiryDate <= addDays(d, 3);
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{it.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        {it.confidence !== "CONFIRMED" ? <Badge tone="warn">{it.confidence.toLowerCase()}</Badge> : null}
                        {it.expiryDate ? <Badge tone={expired ? "danger" : soon ? "warn" : "neutral"}>{expired ? "expired" : "exp"} {relativeDay(it.expiryDate).toLowerCase()}</Badge> : null}
                        {it.foodItem?.nutritionSource ? null : <Badge>no nutrition link</Badge>}
                      </div>
                    </div>
                    <form action={setPantryQtyAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={it.id} />
                      <input name="quantity" defaultValue={it.quantity} inputMode="decimal" aria-label={`${it.name} quantity`} className="h-9 w-20 rounded-lg border border-line-strong bg-surface-2 px-2 text-right tabular outline-none focus:border-accent/70" />
                      <span className="w-12 text-sm text-muted">{it.unit}</span>
                      <button className="h-9 rounded-lg border border-line-strong px-3 text-sm hover:bg-surface-3">Set</button>
                    </form>
                    <EditPantryDialog item={{ id: it.id, name: it.name, location: it.location, expiryDate: it.expiryDate, lowStockThreshold: it.lowStockThreshold, confidence: it.confidence, unit: it.unit }} />
                    <InlineAction action={wastePantryAction} fields={{ id: it.id }} variant="ghost" size="iconSm" confirm={`Mark remaining ${it.name} as wasted?`} title="Discard (wasted)"><Trash2 className="h-4 w-4" /></InlineAction>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      }) : <Empty icon={<Refrigerator className="h-7 w-7" />} title={q ? "Nothing matches" : "The pantry is empty"}>Add items above, tell the assistant what you bought, or save a grocery receipt with “add to pantry”.</Empty>}
      <SectionTitle>Recent inventory changes</SectionTitle>
      <Card>
        <ul className="divide-y divide-line">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className={cn("w-16 shrink-0 text-right tabular", h.delta > 0 ? "text-accent" : "text-muted")}>{h.delta > 0 ? "+" : ""}{h.delta}</span>
              <span className="w-10 text-faint">{h.unit}</span>
              <span className="flex-1">{h.name}</span>
              <Badge tone={h.reason === "WASTE" ? "danger" : h.reason === "MEAL" ? "info" : "neutral"}>{h.reason.toLowerCase()}</Badge>
              <span className="w-28 text-right text-xs text-faint">{h.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
          {!history.length ? <li className="px-5 py-4 text-sm text-faint">No changes recorded yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
