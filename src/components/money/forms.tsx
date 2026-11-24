"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Camera, Loader2 } from "lucide-react";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Textarea, Checkbox, buttonClass } from "../ui";
import { addExpenseAction, updateExpenseAction, createBillAction, payBillAction, addPriceAction } from "@/app/(app)/money/actions";
import { ScheduleFields } from "../home/forms";
import { UnitSelect } from "../shell/quick-add";
import { today } from "@/lib/dates";

type Cat = { key: string; name: string };
type Prof = { id: string; name: string };

export function ExpenseDialog({ categories, profiles, viewerId, expense }: { categories: Cat[]; profiles: Prof[]; viewerId: string; expense?: { id: string; date: string; amount: string; merchant: string; description: string; category: string; paidBy: string | null } }) {
  return (
    <DialogButton label={expense ? "Edit" : "Add expense"} icon={expense ? undefined : <Plus className="h-4 w-4" />} title={expense ? "Edit expense" : "New expense"} variant={expense ? "ghost" : "primary"} size={expense ? "sm" : "md"}>
      {(close) => (
        <ActionForm action={expense ? updateExpenseAction : addExpenseAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          {expense ? <input type="hidden" name="id" value={expense.id} /> : null}
          <Field label="Amount"><Input name="amount" inputMode="decimal" required defaultValue={expense?.amount} /></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={expense?.date ?? today()} required /></Field>
          <Field label="Merchant / payee"><Input name="merchant" defaultValue={expense?.merchant} /></Field>
          <Field label="Category"><Select name="category" defaultValue={expense?.category ?? "groceries"}>{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <Field label="Description" className="col-span-2"><Input name="description" defaultValue={expense?.description} /></Field>
          <Field label="Paid by"><Select name="paidBy" defaultValue={expense?.paidBy ?? viewerId}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          {!expense ? <Field label="Tax (optional)"><Input name="tax" inputMode="decimal" /></Field> : <div />}
          <div className="col-span-2 flex justify-end"><SubmitButton>{expense ? "Save" : "Add to ledger"}</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function BillDialog({ categories }: { categories: Cat[] }) {
  return (
    <DialogButton label="Add bill" icon={<Plus className="h-4 w-4" />} title="New bill" variant="primary">
      {(close) => (
        <ActionForm action={createBillAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Bill" className="col-span-2"><Input name="name" required placeholder="Electricity" /></Field>
          <Field label="Provider"><Input name="provider" /></Field>
          <Field label="Amount"><Input name="amount" inputMode="decimal" required /></Field>
          <Field label="Next due"><Input type="date" name="dueDate" defaultValue={today()} required /></Field>
          <Field label="Category"><Select name="category" defaultValue="utilities">{categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <ScheduleFields />
          <Field label="Remind days before"><Input name="remind" inputMode="numeric" defaultValue="3" /></Field>
          <Field label="Notes" className="col-span-2"><Textarea name="notes" className="min-h-16" /></Field>
          <p className="col-span-2 text-xs text-faint">HomeOS tracks and reminds — it never makes payments.</p>
          <div className="col-span-2 flex justify-end"><SubmitButton>Add bill</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function PayBillDialog({ bill, profiles, viewerId }: { bill: { id: string; name: string; amount: string }; profiles: Prof[]; viewerId: string }) {
  return (
    <DialogButton label="Mark paid" title={`Record payment: ${bill.name}`} variant="outline" size="sm">
      {(close) => (
        <ActionForm action={payBillAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="billId" value={bill.id} />
          <Field label="Amount paid"><Input name="amount" inputMode="decimal" defaultValue={bill.amount} required /></Field>
          <Field label="Paid on"><Input type="date" name="paidDate" defaultValue={today()} required /></Field>
          <Field label="Paid by"><Select name="paidBy" defaultValue={viewerId}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Checkbox name="createExpense" label="Add to ledger" defaultChecked className="self-end" />
          <div className="col-span-2 flex justify-end"><SubmitButton>Record payment</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function PriceDialog({ stores, product }: { stores: string[]; product?: string }) {
  return (
    <DialogButton label="Record a price" icon={<Plus className="h-4 w-4" />} title="Record a price" variant="secondary">
      {(close) => (
        <ActionForm action={addPriceAction} onSuccess={close} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Product" className="col-span-2"><Input name="product" defaultValue={product} required placeholder="Eggs" /></Field>
          <Field label="Brand"><Input name="brand" /></Field>
          <Field label="Variant"><Input name="variant" placeholder="free range" /></Field>
          <Field label="Package size"><Input name="size" inputMode="decimal" required defaultValue="1" /></Field>
          <Field label="Unit"><UnitSelect defaultValue="each" /></Field>
          <Field label="Price paid"><Input name="price" inputMode="decimal" required /></Field>
          <Field label="Regular price"><Input name="regular" inputMode="decimal" placeholder="if on promo" /></Field>
          <Field label="Store"><Input name="store" list="price-stores" /></Field>
          <datalist id="price-stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} /></Field>
          <Field label="Source"><Select name="source" defaultValue="MANUAL"><option value="MANUAL">I paid this</option><option value="ESTIMATE">Estimate</option><option value="EXTERNAL">Seen elsewhere (flyer, website)</option></Select></Field>
          <Checkbox name="promo" label="Promotional price" className="self-end" />
          <p className="col-span-full text-xs text-faint">Unit prices are normalised automatically (per kg, litre or item) so different sizes compare fairly. Earlier prices are kept, never overwritten.</p>
          <div className="col-span-full flex justify-end"><SubmitButton>Save price</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

/** Photo or camera capture → local OCR → review screen. */
export function ReceiptUpload() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; dup?: string } | null>(null);
  const router = useRouter();
  const onFile = async (f: File) => {
    setBusy(true); setError(null);
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/receipts", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError({ msg: data.error, dup: data.duplicateOf }); return; }
    router.push(`/money/receipts/${data.id}`);
  };
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-8 text-center">
      <Camera className="h-7 w-7 text-faint" />
      <p className="font-medium">Scan a receipt or bill</p>
      <p className="max-w-md text-sm text-muted">Take a photo or choose an image. Text is read on this Mac with open-source OCR; you review everything before it&apos;s saved. Card numbers are masked to the last 4 digits.</p>
      <button type="button" className={buttonClass("primary", "lg")} onClick={() => ref.current?.click()} disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Reading receipt…</> : <><Camera className="h-4 w-4" />Photo or image</>}</button>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      {error ? <p className="text-sm text-danger">{error.msg} {error.dup ? <a className="underline" href={`/money/receipts/${error.dup}`}>Open it</a> : null}</p> : null}
    </div>
  );
}
