"use client";
import { Pencil } from "lucide-react";
import { DialogButton } from "../dialog";
import { ActionForm, InlineAction, SubmitButton } from "../forms";
import { Field, Input, Select } from "../ui";
import { updateGroceryItemAction, deleteGroceryAction } from "@/app/(app)/food/actions";

const UNITS = ["each", "pack", "bunch", "g", "kg", "ml", "l", "lb", "oz", "dozen", "can", "bottle", "jar"];

export function GroceryItemEdit({ item, sections, section }: { item: { id: string; name: string; quantity: number; unit: string; price: string; note: string; hasFood: boolean }; sections: { key: string; label: string }[]; section: string }) {
  return (
    <DialogButton label="" icon={<Pencil className="h-4 w-4" />} title={item.name} variant="ghost" size="iconSm" className="shrink-0" aria-label={`Edit ${item.name}`}>
      {(close) => (
        <div className="space-y-4">
          {item.note ? <p className="text-sm text-muted">{item.note}</p> : null}
          <ActionForm action={updateGroceryItemAction} onSuccess={close} resetOnSuccess={false} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="id" value={item.id} />
            <Field label="Amount to buy"><Input name="quantity" inputMode="decimal" defaultValue={item.quantity || ""} placeholder="—" /></Field>
            <Field label="Unit"><Select name="unit" defaultValue={item.unit}>{(UNITS.includes(item.unit) ? UNITS : [item.unit, ...UNITS]).map((u) => <option key={u}>{u}</option>)}</Select></Field>
            {item.hasFood ? <Field label="Aisle"><Select name="section" defaultValue={section}>{sections.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field> : <div />}
            <Field label="Price paid (optional)" hint="Goes into spending and price history when you finish shopping"><Input name="price" inputMode="decimal" defaultValue={item.price} placeholder="0.00" /></Field>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <InlineAction action={deleteGroceryAction} fields={{ id: item.id }} variant="ghost" size="md" className="text-danger">Remove from list</InlineAction>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </DialogButton>
  );
}
