import Link from "next/link";
import { Tags } from "lucide-react";
import { requireViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { productComparison, priceChanges, brandSwitchSavings } from "@/lib/finance/prices";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { unitPriceDisplay } from "@/lib/units";
import { Card, CardHeader, CardBody, Badge, Empty, Input, Select } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { TrendLine } from "@/components/charts";
import { PriceDialog } from "@/components/money/forms";
import { linkProductFoodAction, saveComparisonAction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prices" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ product?: string; q?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const [products, stores, changes, savings, saved] = await Promise.all([
    prisma.product.findMany({ where: sp.q ? { name: { contains: sp.q } } : {}, include: { variants: { include: { _count: { select: { priceRecords: true } } } } }, orderBy: { name: "asc" } }),
    prisma.store.findMany({ orderBy: { name: "asc" } }), priceChanges(), brandSwitchSavings(90), prisma.priceComparison.findMany({ include: { product: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const selected = sp.product ? await productComparison(sp.product).catch(() => null) : null;
  const foods = selected ? await prisma.foodItem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const productRow = selected ? await prisma.product.findUnique({ where: { id: selected.product.id } }) : null;
  const money = (c: number) => formatCents(Math.round(c), viewer.currency);
  // Chart: one line per variant (≤ 5 shown), unit price over time, only comparable (same base unit) variants.
  const baseUnit = selected?.variants[0]?.normalizedUnit;
  const chartVariants = selected?.variants.filter((v) => v.normalizedUnit === baseUnit).slice(0, 5) ?? [];
  const dates = [...new Set(chartVariants.flatMap((v) => v.history.map((h) => h.date)))].sort();
  const chartData = dates.map((d) => ({ date: d, ...Object.fromEntries(chartVariants.map((v, i) => [`v${i}`, (() => { const h = v.history.filter((x) => x.date === d).at(-1); return h ? Math.round(unitPriceDisplay(h.unitPrice, v.normalizedUnit).value) : null; })()])) }));
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <form><Input name="q" defaultValue={sp.q} placeholder="Search products" /></form>
        <PriceDialog stores={stores.map((s) => s.name)} product={selected?.product.name} />
        <Card>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {products.map((p) => {
              const n = p.variants.reduce((a, v) => a + v._count.priceRecords, 0);
              return <li key={p.id}><Link href={`/money/prices?product=${p.id}`} className={cn("flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2", sp.product === p.id && "bg-surface-3")}><span>{p.name}</span><span className="text-xs text-faint">{p.variants.length} option(s) · {n}</span></Link></li>;
            })}
            {!products.length ? <li className="px-4 py-4 text-sm text-faint">No products yet. Save a receipt or record a price.</li> : null}
          </ul>
        </Card>
        {saved.length ? <Card className="p-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Saved comparisons</p>{saved.map((s) => <Link key={s.id} href={`/money/prices?product=${s.productId}`} className="block rounded-md px-1 py-1 text-sm hover:bg-surface-2">{s.name}</Link>)}</Card> : null}
      </div>
      <div className="space-y-5">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{selected.product.name}</h2>
              <Badge>recorded prices — not live market prices</Badge>
              <div className="ml-auto flex items-center gap-2">
                <InlineAction action={saveComparisonAction} fields={{ productId: selected.product.id, name: `${selected.product.name} comparison` }} variant="ghost">Save comparison</InlineAction>
                <form action={linkProductFoodAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="productId" value={selected.product.id} />
                  <Select name="foodItemId" defaultValue={productRow?.foodItemId ?? ""} className="h-9 w-44 text-sm" aria-label="Linked ingredient"><option value="">Not linked to ingredient</option>{foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                  <button className="h-9 rounded-lg border border-line-strong px-2.5 text-xs">Link</button>
                </form>
              </div>
            </div>
            <p className="text-xs text-faint">Linking to an ingredient lets the grocery list and meal planner estimate costs from these prices.</p>
            <Card>
              <CardHeader title="Options ranked by unit price" sub="Latest recorded price, normalised per kg / litre / item" />
              <ul className="divide-y divide-line border-t border-line">
                {selected.variants.map((v, i) => {
                  const u = unitPriceDisplay(v.latest.unitPrice, v.normalizedUnit);
                  const best = selected.variants.find((x) => x.normalizedUnit === v.normalizedUnit)!;
                  const pctMore = best !== v ? ((v.latest.unitPrice - best.latest.unitPrice) / best.latest.unitPrice) * 100 : 0;
                  return (
                    <li key={v.variantId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <div className="min-w-48 flex-1"><p className="font-medium">{v.label}</p><p className="text-xs text-faint">{v.count} record(s) · lowest {money(unitPriceDisplay(v.min.unitPrice, v.normalizedUnit).value)}/{u.label} on {formatDate(v.min.date)}{v.min.store ? ` @ ${v.min.store}` : ""}{v.changePct !== null ? ` · ${v.changePct >= 0 ? "+" : ""}${v.changePct.toFixed(1)}% since first record` : ""}</p></div>
                      {i === 0 || best === v ? <Badge tone="accent">best value</Badge> : <Badge>+{pctMore.toFixed(0)}%</Badge>}
                      {v.latest.isPromo ? <Badge tone="warn">promo</Badge> : null}
                      {v.latest.source !== "RECEIPT" && v.latest.source !== "MANUAL" ? <Badge tone="info">{v.latest.source.toLowerCase()}</Badge> : null}
                      <div className="w-36 text-right"><p className="font-semibold tabular">{money(u.value)} / {u.label}</p>{u.alt ? <p className="text-xs tabular text-faint">{money(u.alt.value)} / {u.alt.label}</p> : null}</div>
                      <span className="w-28 text-right text-xs text-muted">{money(v.latest.priceCents)} · {formatDate(v.latest.date)}{v.latest.store ? <><br />{v.latest.store}</> : null}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            {chartData.length > 1 ? (
              <Card>
                <CardHeader title="Unit price history" sub={`per ${baseUnit === "g" ? "kg" : baseUnit === "ml" ? "litre" : "item"}`} />
                <CardBody><TrendLine data={chartData} x="date" xFmt="date" fmt="money" currency={viewer.currency} series={chartVariants.map((v, i) => ({ key: `v${i}`, name: v.label }))} /></CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Lowest recorded price by store" />
              <ul className="divide-y divide-line border-t border-line text-sm">
                {selected.stores.map((s) => { const u = unitPriceDisplay(s.minUnitPrice, s.normalizedUnit); return <li key={s.store + s.normalizedUnit} className="flex justify-between px-5 py-2.5"><span>{s.store}</span><span className="tabular">{money(u.value)} / {u.label}</span></li>; })}
              </ul>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader title="Biggest price increases" sub="From recorded receipt & manual prices, last 12 months" />
              <ul className="divide-y divide-line border-t border-line text-sm">
                {changes.filter((c) => c.changePct > 0.5).slice(0, 8).map((c) => { const u = unitPriceDisplay(c.latest, c.normalizedUnit); return <li key={c.productId + c.variant}><Link href={`/money/prices?product=${c.productId}`} className="flex justify-between px-5 py-2.5 hover:bg-surface-2"><span>{c.product} <span className="text-faint">{c.variant}</span></span><span className="tabular text-warn">+{c.changePct.toFixed(1)}% · {money(u.value)}/{u.label}</span></Link></li>; })}
                {!changes.some((c) => c.changePct > 0.5) ? <li className="px-5 py-4 text-faint">Needs at least two recorded prices for the same product option.</li> : null}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Savings from switching" sub="If the last 90 days' purchases had been the cheapest recorded option" />
              <ul className="divide-y divide-line border-t border-line text-sm">
                {savings.map((s) => <li key={s.productId + s.normalizedUnit}><Link href={`/money/prices?product=${s.productId}`} className="flex justify-between px-5 py-2.5 hover:bg-surface-2"><span>{s.product} <span className="text-faint">→ {s.cheapest}</span></span><span className="tabular text-accent">{money(s.potentialSavingsCents)}</span></Link></li>)}
                {!savings.length ? <li className="px-5 py-4 text-faint">Needs purchases of at least two brands or sizes of the same product.</li> : null}
              </ul>
            </Card>
            {!products.length ? <Empty icon={<Tags className="h-7 w-7" />} title="No price history yet">Prices are recorded from saved receipts, finished shopping trips and manual entries.</Empty> : null}
          </>
        )}
      </div>
    </div>
  );
}
