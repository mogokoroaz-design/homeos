"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Field, Input, Select, Button, Checkbox, Card } from "../ui";
import { saveReceiptAction } from "@/app/(app)/money/actions";
import { parseMoneyToCents, formatCents } from "@/lib/money";
import { COMMON_UNITS } from "@/lib/units";
import { cn } from "@/lib/utils";

import type { ReviewData, ReviewItem } from "@/lib/finance/review";
export type { ReviewData };

export function ReceiptReview({ receiptId, initial, categories, profiles, viewerId, currency, imageUrl, ocrText, warnings }: { receiptId: string; initial: ReviewData; categories: { key: string; name: string }[]; profiles: { id: string; name: string }[]; viewerId: string; currency: string; imageUrl: string; ocrText: string; warnings: string[] }) {
  const [d, setD] = useState(initial);
  const [paidBy, setPaidBy] = useState(viewerId);
  const [createExpense, setCreateExpense] = useState(true);
  const [allowDup, setAllowDup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const itemsSum = useMemo(() => d.items.reduce((a, i) => a + (parseMoneyToCents(i.total) ?? 0), 0), [d.items]);
  const totalCents = parseMoneyToCents(d.total) ?? 0;
  const taxCents = parseMoneyToCents(d.tax) ?? 0;
  const diff = d.items.length ? totalCents - taxCents - itemsSum : 0;
  const setItem = (i: number, p: Partial<ReviewItem>) => setD({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = () => start(async () => {
    setError(null);
    const payload = {
      merchant: d.merchant, storeName: d.storeName, date: d.date, totalCents, taxCents: d.tax ? taxCents : null, subtotalCents: parseMoneyToCents(d.subtotal), categoryKey: d.categoryKey, paymentNote: d.paymentNote, paidByProfileId: paidBy, createExpense, allowPossibleDuplicate: allowDup,
      items: d.items.map((i) => ({ name: i.name, quantity: Number(i.quantity) || 1, unit: i.unit, unitPriceCents: parseMoneyToCents(i.unitPrice), totalCents: parseMoneyToCents(i.total) ?? 0, brand: i.brand, packageSize: Number(i.packageSize) > 0 ? Number(i.packageSize) : null, packageUnit: i.packageUnit, recordPrice: i.recordPrice, addToPantry: i.addToPantry, foodItemId: null })),
    };
    const r = await saveReceiptAction(receiptId, JSON.stringify(payload));
    if (!r.ok) { setError(r.error.replace(/^DUPLICATE: /, "")); return; }
    setMsg(r.message ?? "Saved");
    router.refresh();
  });
  if (msg) return <Card className="p-6"><p className="font-medium text-accent">{msg}</p><div className="mt-4 flex gap-2"><Button onClick={() => router.push("/money/receipts")}>Back to receipts</Button><Button variant="ghost" onClick={() => router.push("/money/prices")}>View prices</Button></div></Card>;
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        <a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt="Original receipt" className="max-h-[560px] w-full rounded-xl border border-line object-contain" /></a>
        <details><summary className="cursor-pointer text-sm text-muted">OCR text</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-muted">{ocrText || "(no text recognised)"}</pre></details>
      </div>
      <div className="space-y-4">
        {warnings.length ? <ul className="space-y-1 rounded-xl border border-[#4d4128] bg-warn-dim px-4 py-3 text-sm text-warn">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul> : null}
        <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Field label="Merchant" className="col-span-2"><Input value={d.merchant} onChange={(e) => setD({ ...d, merchant: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="Category"><Select value={d.categoryKey} onChange={(e) => setD({ ...d, categoryKey: e.target.value })}>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <Field label="Total"><Input value={d.total} inputMode="decimal" onChange={(e) => setD({ ...d, total: e.target.value })} /></Field>
          <Field label="Tax"><Input value={d.tax} inputMode="decimal" onChange={(e) => setD({ ...d, tax: e.target.value })} /></Field>
          <Field label="Store (for prices)"><Input value={d.storeName} onChange={(e) => setD({ ...d, storeName: e.target.value })} placeholder={d.merchant} /></Field>
          <Field label="Payment" hint="last 4 digits only"><Input value={d.paymentNote} onChange={(e) => setD({ ...d, paymentNote: e.target.value })} /></Field>
        </Card>
        <Card>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-semibold">Items <span className="font-normal text-muted">({d.items.length})</span></p>
            <Button size="sm" onClick={() => setD({ ...d, items: [...d.items, { name: "", quantity: 1, unit: "each", unitPrice: "", total: "", brand: "", packageSize: "", packageUnit: "g", recordPrice: true, addToPantry: false }] })}><Plus className="h-4 w-4" />Add line</Button>
          </div>
          <div className="space-y-2 border-t border-line p-3">
            {d.items.map((it, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 rounded-xl bg-surface-2 p-2.5 sm:grid-cols-12">
                <Input aria-label="Item" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} className="col-span-6 h-9 sm:col-span-4" placeholder="item" />
                <Input aria-label="Brand" value={it.brand} onChange={(e) => setItem(i, { brand: e.target.value })} className="col-span-3 h-9 sm:col-span-2" placeholder="brand" />
                <Input aria-label="Quantity" value={it.quantity} inputMode="decimal" onChange={(e) => setItem(i, { quantity: Number(e.target.value) || 0 })} className="col-span-1 h-9 px-2" />
                <Select aria-label="Unit" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} className="col-span-2 h-9 px-2 sm:col-span-1">{[...new Set([...COMMON_UNITS, it.unit])].map((u) => <option key={u}>{u}</option>)}</Select>
                <Input aria-label="Line total" value={it.total} inputMode="decimal" onChange={(e) => setItem(i, { total: e.target.value })} className="col-span-2 h-9 text-right sm:col-span-2" placeholder="total" />
                <div className="col-span-4 flex items-center gap-1 sm:col-span-2">
                  <Input aria-label="Package size" value={it.packageSize} inputMode="decimal" onChange={(e) => setItem(i, { packageSize: e.target.value })} className="h-9 px-2" placeholder="pack" title="Package size (e.g. 500 for a 500 g pack)" />
                  <Select aria-label="Package unit" value={it.packageUnit} onChange={(e) => setItem(i, { packageUnit: e.target.value })} className="h-9 w-20 px-1.5">{["g", "kg", "ml", "l", "oz", "lb", "each"].map((u) => <option key={u}>{u}</option>)}</Select>
                </div>
                <div className="col-span-6 flex flex-wrap items-center gap-4 sm:col-span-12">
                  <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={it.recordPrice} onChange={(e) => setItem(i, { recordPrice: e.target.checked })} className="accent-[#9cc2b0]" />record price</label>
                  <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={it.addToPantry} onChange={(e) => setItem(i, { addToPantry: e.target.checked })} className="accent-[#9cc2b0]" />add to pantry</label>
                  <button type="button" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })} className="ml-auto text-faint hover:text-danger" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {!d.items.length ? <p className="px-1 text-sm text-faint">No item lines. You can still save the total as an expense.</p> : null}
          </div>
          <div className={cn("border-t border-line px-4 py-2.5 text-sm", Math.abs(diff) > 2 ? "text-warn" : "text-muted")}>
            Items {formatCents(itemsSum, currency)} + tax {formatCents(taxCents, currency)} {Math.abs(diff) > 2 ? `— ${formatCents(Math.abs(diff), currency)} ${diff > 0 ? "less than" : "more than"} the total` : "= total ✓"}
          </div>
        </Card>
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <Checkbox label="Create expense in household ledger" checked={createExpense} onChange={(e) => setCreateExpense(e.target.checked)} />
          <label className="flex items-center gap-2 text-sm">Paid by <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="h-9 w-32">{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
          {error?.includes("already exists") ? <Checkbox label="Save anyway (different purchase)" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} /> : null}
          <Button variant="primary" className="ml-auto" onClick={save} disabled={pending || !d.merchant || !d.date || !totalCents}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Approve &amp; save</Button>
        </Card>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <p className="text-xs text-faint">Weighed items (kg/lb) record the weighed amount as the package. For counted items, enter the package size (e.g. 500 g) so unit prices compare fairly across brands.</p>
      </div>
    </div>
  );
}

