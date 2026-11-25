import { ShoppingCart, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { orderedSections, sectionFor } from "@/lib/food/sections";
import { getSetting } from "@/lib/settings";
import { AutoSubmitSelect } from "@/components/auto-submit";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getActiveList, getGroceryRange, computeRequirements } from "@/lib/food/grocery";
import { formatCents, centsToInput } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, Badge, Empty, SectionTitle } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { CompleteShopping, AddGroceryForm, SyncGroceryForm } from "@/components/food/grocery-forms";
import { toggleGroceryAction, setGroceryPriceAction, deleteGroceryAction, moveSectionAction, setItemSectionAction } from "../actions";
import { cn } from "@/lib/utils";
import { PhotoToPantry } from "@/components/food/photo-to-pantry";

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
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Card className="p-4"><SyncGroceryForm from={range.from} to={range.to} /><p className="mt-2 text-xs text-faint">Meal-plan items update automatically whenever meals, portions or pantry stock change. Items you add manually are never removed.</p></Card>
        <Card className="p-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><PhotoToPantry defaultDestination="LIST" /><span className="text-sm text-faint">Photo of an empty package or a handwritten list → shopping list.</span></div><AddGroceryForm /></Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{items.length - checked} to buy · est. <span className="tabular text-ink">{formatCents(est, viewer.currency)}</span>{checked ? <> · {checked} in cart{actual ? <> · <span className="tabular text-ink">{formatCents(actual, viewer.currency)}</span></> : null}</> : null}</p>
          {checked ? <CompleteShopping listId={list.id} checkedCount={checked} actualTotal={actual ? centsToInput(actual) : ""} profiles={profiles} viewerId={viewer.profileId} stores={stores.map((s) => s.name)} /> : null}
        </div>
        {items.length ? sections.filter((sec) => groups.has(sec.key)).map((sec) => [sec, groups.get(sec.key)!] as const).map(([sec, list]) => (
          <Card key={sec.key}>
            <CardHeader title={sec.label} sub={`${list.filter((i) => !i.checked).length} to get`} />
            <ul className="divide-y divide-line border-t border-line">
              {list.map((it) => (
                <li key={it.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", it.checked && "opacity-60")}>
                  <InlineAction action={toggleGroceryAction} fields={{ id: it.id }} variant="ghost" size="iconSm" title={it.checked ? "Untick" : "Tick"}>
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", it.checked ? "border-accent bg-accent text-[#0c1110]" : "border-line-strong")}>{it.checked ? "✓" : ""}</span>
                  </InlineAction>
                  <div className="min-w-40 flex-1">
                    <p className={cn("font-medium", it.checked && "line-through")}>{it.name}</p>
                    <p className="text-xs text-faint">{it.packageNote}{it.source !== "MANUAL" ? <Badge className="ml-1.5">{it.source === "MEAL_PLAN" ? "meal plan" : it.source.toLowerCase()}</Badge> : null}</p>
                  </div>
                  <form action={setGroceryPriceAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={it.id} />
                    <input name="quantity" defaultValue={it.quantity || ""} placeholder="—" inputMode="decimal" aria-label="Quantity" className="h-9 w-16 rounded-lg border border-line-strong bg-surface-2 px-2 text-right tabular outline-none" />
                    <span className="w-10 text-xs text-muted">{it.quantity ? it.unit : "as needed"}</span>
                    <input name="price" defaultValue={centsToInput(it.actualPriceCents)} placeholder={it.estimatedPriceCents ? `~${centsToInput(it.estimatedPriceCents)}` : "price"} inputMode="decimal" aria-label="Price paid" className="h-9 w-20 rounded-lg border border-line-strong bg-surface-2 px-2 text-right tabular outline-none" />
                    <button className="h-9 rounded-lg border border-line-strong px-2.5 text-xs hover:bg-surface-3">Save</button>
                  </form>
                  {it.foodItemId ? (
                    <form action={setItemSectionAction}>
                      <input type="hidden" name="foodItemId" value={it.foodItemId} />
                      <AutoSubmitSelect name="section" defaultValue={sec.key} aria-label={`Section for ${it.name}`} className="h-9 w-28 rounded-lg border border-line-strong bg-surface-2 px-1.5 text-xs text-muted">
                        {sections.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </AutoSubmitSelect>
                    </form>
                  ) : null}
                  <InlineAction action={deleteGroceryAction} fields={{ id: it.id }} variant="ghost" size="iconSm" title="Remove"><Trash2 className="h-4 w-4" /></InlineAction>
                </li>
              ))}
            </ul>
          </Card>
        )) : <Empty icon={<ShoppingCart className="h-7 w-7" />} title="Nothing to buy">Plan meals and the list fills itself from what the pantry is missing.</Empty>}
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="What the plan needs" sub={`${formatDate(range.from)} – ${formatDate(range.to)}`} />
          <ul className="max-h-[520px] divide-y divide-line overflow-y-auto border-t border-line text-sm">
            {reqs.map((r) => (
              <li key={r.key} className="px-4 py-2">
                <div className="flex justify-between gap-2"><span className="font-medium">{r.name}</span><span className={cn("tabular", r.toBuy ? "text-warn" : "text-accent")}>{r.required === null ? (r.toBuy === 0 ? "have" : "as needed") : r.toBuy ? `buy ${formatQuantity(r.toBuy, r.unit)}` : "covered"}</span></div>
                <p className="text-xs text-faint">{r.required !== null ? `need ${formatQuantity(r.required, r.unit)} · pantry ${formatQuantity(r.inPantry, r.unit)}${r.pantryConfidence !== "CONFIRMED" && r.pantryConfidence !== "—" ? ` (${r.pantryConfidence.toLowerCase()})` : ""} · ` : ""}{r.recipes.join(", ")}</p>
              </li>
            ))}
            {!reqs.length ? <li className="px-4 py-4 text-faint">No planned recipe meals in this range.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Store layout" sub="Order sections the way you walk through your shop" />
          <ul aria-label="Store layout" className="divide-y divide-line border-t border-line text-sm">
            {sections.map((sec, k) => (
              <li key={sec.key} className="flex items-center gap-2 px-4 py-1.5">
                <span className="w-5 text-faint tabular">{k + 1}</span>
                <span className="flex-1" data-section>{sec.label}</span>
                <InlineAction action={moveSectionAction} fields={{ key: sec.key, dir: "up" }} variant="ghost" size="iconSm" title={`Move ${sec.label} up`}><ArrowUp className="h-3.5 w-3.5" /></InlineAction>
                <InlineAction action={moveSectionAction} fields={{ key: sec.key, dir: "down" }} variant="ghost" size="iconSm" title={`Move ${sec.label} down`}><ArrowDown className="h-3.5 w-3.5" /></InlineAction>
              </li>
            ))}
          </ul>
        </Card>
        <SectionTitle>Shopping history</SectionTitle>
        <Card>
          <ul className="divide-y divide-line text-sm">
            {history.map((h) => <li key={h.id} className="flex justify-between px-4 py-2"><span>{formatDate(h.date, { year: true })} · {h.itemCount} items</span><span className="tabular">{h.totalCents ? formatCents(h.totalCents, viewer.currency) : "—"}</span></li>)}
            {!history.length ? <li className="px-4 py-4 text-faint">No trips recorded yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
