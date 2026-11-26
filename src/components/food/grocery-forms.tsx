"use client";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Checkbox } from "../ui";
import { completeShoppingAction, addGroceryAction, syncGroceryAction } from "@/app/(app)/food/actions";
import { UnitSelect } from "../shell/quick-add";
import { ShoppingBag, RefreshCw } from "lucide-react";

export function CompleteShopping({ listId, checkedCount, actualTotal, profiles, viewerId, stores }: { listId: string; checkedCount: number; actualTotal: string; profiles: { id: string; name: string }[]; viewerId: string; stores: string[] }) {
  return (
    <DialogButton label={`Done shopping (${checkedCount})`} icon={<ShoppingBag className="h-4 w-4" />} title="Record this shopping trip" variant="primary">
      {(close) => (
        <ActionForm action={completeShoppingAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="listId" value={listId} />
          <Field label="Store"><Input name="store" list="stores" /></Field>
          <datalist id="stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="Total paid" hint="Leave blank to use item prices"><Input name="total" inputMode="decimal" placeholder={actualTotal || "0.00"} /></Field>
          <Field label="Paid by"><Select name="paidBy" defaultValue={viewerId}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div />
          <Checkbox name="createExpense" label="Add expense to the household ledger" defaultChecked className="col-span-2" />
          <Checkbox name="addToPantry" label="Add ticked items to the pantry" defaultChecked className="col-span-2" />
          <Checkbox name="recordPrices" label="Record item prices in price history" defaultChecked className="col-span-2" />
          <p className="col-span-2 text-xs text-faint">Only ticked items are recorded; unticked items move to a fresh list. For itemised prices with brands, scan the receipt in Money → Receipts instead.</p>
          <div className="col-span-2 flex justify-end"><SubmitButton>Record shopping</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function AddGroceryForm() {
  return (
    <ActionForm action={addGroceryAction} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="Add item…" required className="min-w-40 flex-1" aria-label="Item" />
      <Input name="quantity" inputMode="decimal" defaultValue="1" className="w-20" aria-label="Quantity" />
      <div className="w-28"><UnitSelect /></div>
      <SubmitButton variant="secondary">Add</SubmitButton>
    </ActionForm>
  );
}

export function SyncGroceryForm({ from, to }: { from: string; to: string }) {
  return (
    <ActionForm action={syncGroceryAction} successMessage resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
      <Field label="Meal plan from"><Input type="date" name="from" defaultValue={from} /></Field>
      <Field label="to"><Input type="date" name="to" defaultValue={to} /></Field>
      <SubmitButton variant="secondary"><RefreshCw className="h-4 w-4" />Recalculate</SubmitButton>
    </ActionForm>
  );
}
