import { ShoppingCart, ArrowUp, ArrowDown } from "lucide-react";
import { orderedSections, sectionFor } from "@/lib/food/sections";
import { getSetting } from "@/lib/settings";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getActiveList, getGroceryRange, computeRequirements } from "@/lib/food/grocery";
import { formatCents, centsToInput } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import { formatDate } from "@/lib/dates";
import { Card, Empty } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { CompleteShopping, AddGroceryForm, SyncGroceryForm } from "@/components/food/grocery-forms";
import { toggleGroceryAction, moveSectionAction } from "../actions";
import { cn } from "@/lib/utils";
import { PhotoToPantry } from "@/components/food/photo-to-pantry";
import { GroceryVoice } from "@/components/food/grocery-voice";
import { GroceryItemEdit } from "@/components/food/grocery-item";

export const metadata = { title: "Groceries" };

export default async function GroceryPage() {
  const viewer = await requireViewer();
  const list = await getActiveList();
  const range = await getGroceryRange();
  const [items, reqs, profiles, stores, history] = await Promise.all([
    prisma.groceryItem.findMany({ where: { listId: list.id }, include: { foodItem: true }, orderBy: [{ checked: "asc" }, { name: "asc" }] }),
    computeRequirements(range.from, range.to),
    prisma.householdProfile.findMany({ select: { id: true, name: true } }),
    prisma.store.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.shoppingHistory.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const sections = orderedSections(await getSetting("grocery.sectionOrder", "[]"));
  const groups = new Map<string, typeof items>();
  for (const it of items) { const k = sectionFor(it.foodItem?.category); groups.set(k, [...(groups.get(k) ?? []), it]); }
  const est = items.filter((i) => !i.checked).reduce((a, i) => a + (i.estimatedPriceCents ?? 0), 0);
  const actual = items.filter((i) => i.checked).reduce((a, i) => a + (i.actualPriceCents ?? 0), 0);
  const checked = items.filter((i) => i.checked).length;
  const toGet = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);
  const amount = (it: (typeof items)[number]) => (it.quantity ? formatQuantity(it.quantity, it.unit) : "");
  const Row = ({ it, sec }: { it: (typeof items)[number]; sec: string }) => (
    <li className={cn("flex items-center gap-3 px-4 py-3", it.checked && "opacity-60")}>
      <InlineAction action={toggleGroceryAction} fields={{ id: it.id }} variant="ghost" size="iconSm" title={it.checked ? `Put ${it.name} back` : `Got ${it.name}`}>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg border-2", it.checked ? "border-accent bg-accent text-[#0c1110]" : "border-line-strong")}>{it.checked ? "✓" : ""}</span>
      </InlineAction>
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug", it.checked && "line-through")}><span className="font-medium">{it.name}</span>{amount(it) ? <span className="ml-2 tabular text-muted">{amount(it)}</span> : null}</p>
        {it.packageNote ? <p className="truncate text-xs text-faint">{it.packageNote}</p> : null}
      </div>
      {it.actualPriceCents ? <span className="text-sm tabular text-muted">{formatCents(it.actualPriceCents, viewer.currency)}</span> : null}
      <GroceryItemEdit item={{ id: it.id, name: it.name, quantity: it.quantity, unit: it.unit, price: centsToInput(it.actualPriceCents), note: it.packageNote, hasFood: Boolean(it.foodItemId) }} sections={sections} section={sec} />
    </li>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="space-y-3 p-4">
        <AddGroceryForm />
        <div className="flex flex-wrap items-center gap-2 text-sm text-faint"><PhotoToPantry defaultDestination="LIST" /><GroceryVoice /><span>or snap an empty pack / say “milk, eggs and 2 kg rice”</span></div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted"><span className="text-ink">{toGet.length} to get</span>{est ? <> · about <span className="tabular">{formatCents(est, viewer.currency)}</span></> : null}{inCart.length ? <> · {inCart.length} in the cart</> : null}</p>
        {inCart.length ? <CompleteShopping listId={list.id} checkedCount={inCart.length} actualTotal={actual ? centsToInput(actual) : ""} profiles={profiles} viewerId={viewer.profileId} stores={stores.map((s) => s.name)} /> : null}
      </div>

      {toGet.length ? sections.filter((sec) => groups.get(sec.key)?.some((i) => !i.checked)).map((sec) => (
        <Card key={sec.key}>
          <p className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-faint">{sec.label}</p>
          <ul className="divide-y divide-line">{groups.get(sec.key)!.filter((i) => !i.checked).map((it) => <Row key={it.id} it={it} sec={sec.key} />)}</ul>
        </Card>
      )) : <Empty icon={<ShoppingCart className="h-7 w-7" />} title={inCart.length ? "Everything's in the cart" : "Nothing to buy"}>{inCart.length ? "Press “Done shopping” to put it all in the pantry and record what you spent." : "Plan meals and the list fills itself with what the pantry is missing — or add things above."}</Empty>}

      {inCart.length ? (
        <Card>
          <p className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-faint">In the cart</p>
          <ul className="divide-y divide-line">{inCart.map((it) => <Row key={it.id} it={it} sec={sectionFor(it.foodItem?.category)} />)}</ul>
        </Card>
      ) : null}

      <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm text-muted hover:text-ink">More: meal-plan dates, store aisle order, what the plan needs, past trips</summary>
        <div className="space-y-6 border-t border-line p-4">
          <div>
            <p className="mb-2 text-sm font-medium">Meal-plan dates</p>
            <SyncGroceryForm from={range.from} to={range.to} />
            <p className="mt-2 text-xs text-faint">Items for planned meals update by themselves when meals, portions or the pantry change. Things you add yourself are never removed.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Store aisle order <span className="font-normal text-faint">— the list follows the way you walk through your shop</span></p>
            <ul aria-label="Store layout" className="divide-y divide-line rounded-xl border border-line text-sm">
              {sections.map((sec, k) => (
                <li key={sec.key} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-5 text-faint tabular">{k + 1}</span>
                  <span className="flex-1" data-section>{sec.label}</span>
                  <InlineAction action={moveSectionAction} fields={{ key: sec.key, dir: "up" }} variant="ghost" size="iconSm" title={`Move ${sec.label} up`}><ArrowUp className="h-3.5 w-3.5" /></InlineAction>
                  <InlineAction action={moveSectionAction} fields={{ key: sec.key, dir: "down" }} variant="ghost" size="iconSm" title={`Move ${sec.label} down`}><ArrowDown className="h-3.5 w-3.5" /></InlineAction>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">What the plan needs <span className="font-normal text-faint">({formatDate(range.from)} – {formatDate(range.to)}, exact recipe amounts)</span></p>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
              {reqs.map((r) => (
                <li key={r.key} className="flex justify-between gap-3 px-3 py-1.5">
                  <span>{r.name} <span className="text-xs text-faint">· {r.recipes.join(", ")}</span></span>
                  <span className="shrink-0 tabular text-muted">{r.required === null ? "as needed" : formatQuantity(r.required, r.unit)}</span>
                </li>
              ))}
              {!reqs.length ? <li className="px-3 py-3 text-faint">No planned recipe meals in this range.</li> : null}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Past shopping trips</p>
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {history.map((h) => <li key={h.id} className="flex justify-between px-3 py-1.5"><span>{formatDate(h.date, { year: true })} · {h.itemCount} items</span><span className="tabular">{h.totalCents ? formatCents(h.totalCents, viewer.currency) : "—"}</span></li>)}
              {!history.length ? <li className="px-3 py-3 text-faint">No trips recorded yet.</li> : null}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
