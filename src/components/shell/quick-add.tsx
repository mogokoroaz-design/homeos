"use client";
import { useState } from "react";
import { Dialog } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Checkbox } from "../ui";
import { NoteEditor } from "../notes/note-editor";
import { quickExpense, quickPantry, quickGrocery, quickTask, quickEvent, quickMetric, quickFood } from "@/app/(app)/actions";
import { DEFAULT_CATEGORIES } from "@/lib/finance/categories";
import { COMMON_UNITS } from "@/lib/units";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";

const TABS = [
  ["note", "Note"], ["expense", "Expense"], ["pantry", "Pantry"], ["grocery", "Grocery"], ["task", "Task"], ["event", "Event"], ["metric", "Wellness"], ["food", "Food log"],
] as const;

export function UnitSelect({ name = "unit", defaultValue = "each" }: { name?: string; defaultValue?: string }) {
  return <Select name={name} defaultValue={defaultValue}>{COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>;
}

export function QuickAdd({ open, onClose, profiles, viewerId }: { open: boolean; onClose: () => void; profiles: { id: string; name: string }[]; viewerId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("note");
  const d = today();
  return (
    <Dialog open={open} onClose={onClose} title="Quick add">
      <div className="-mx-1 mb-4 flex flex-wrap gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>{label}</button>
        ))}
      </div>
      {tab === "note" && <NoteEditor onDone={onClose} compact />}
      {tab === "expense" && (
        <ActionForm action={quickExpense} successMessage className="grid grid-cols-2 gap-3">
          <Field label="Amount"><Input name="amount" inputMode="decimal" required placeholder="0.00" autoFocus /></Field>
          <Field label="Date"><Input name="date" type="date" defaultValue={d} required /></Field>
          <Field label="Merchant"><Input name="merchant" /></Field>
          <Field label="Category"><Select name="category" defaultValue="groceries">{DEFAULT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <Field label="Description" className="col-span-2"><Input name="description" /></Field>
          <Field label="Paid by"><Select name="paidBy" defaultValue={viewerId}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div className="flex items-end justify-end"><SubmitButton>Save expense</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "pantry" && (
        <ActionForm action={quickPantry} successMessage className="grid grid-cols-2 gap-3">
          <Field label="Item" className="col-span-2"><Input name="name" required placeholder="e.g. Chicken thighs" autoFocus /></Field>
          <Field label="Quantity"><Input name="quantity" inputMode="decimal" required /></Field>
          <Field label="Unit"><UnitSelect /></Field>
          <Field label="Location"><Select name="location" defaultValue=""><option value="">Auto</option><option value="FRIDGE">Fridge</option><option value="FREEZER">Freezer</option><option value="PANTRY">Pantry</option><option value="OTHER">Other</option></Select></Field>
          <Field label="Expiry"><Input name="expiryDate" type="date" /></Field>
          <Field label="Low-stock alert at" hint="Optional, same unit"><Input name="lowStock" inputMode="decimal" /></Field>
          <div className="flex items-end justify-end"><SubmitButton>Add to pantry</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "grocery" && (
        <ActionForm action={quickGrocery} successMessage className="grid grid-cols-3 gap-3">
          <Field label="Item" className="col-span-3"><Input name="name" required autoFocus /></Field>
          <Field label="Qty"><Input name="quantity" inputMode="decimal" defaultValue="1" /></Field>
          <Field label="Unit"><UnitSelect /></Field>
          <div className="flex items-end justify-end"><SubmitButton>Add</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "task" && (
        <ActionForm action={quickTask} successMessage className="grid grid-cols-2 gap-3">
          <Field label="Task" className="col-span-2"><Input name="title" required autoFocus /></Field>
          <Field label="Category"><Select name="category" defaultValue="CLEANING">{["CLEANING", "GARDENING", "MAINTENANCE", "LAUNDRY", "KITCHEN", "ERRAND", "OTHER"].map((c) => <option key={c} value={c}>{c[0] + c.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Due"><Input name="dueDate" type="date" defaultValue={d} /></Field>
          <Field label="Repeats"><Select name="freq" defaultValue="NONE"><option value="NONE">Doesn&apos;t repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></Select></Field>
          <Field label="Assignee"><Select name="assignee" defaultValue=""><option value="">Anyone</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Add task</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "event" && (
        <ActionForm action={quickEvent} successMessage className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><Input name="title" required autoFocus /></Field>
          <Field label="Date"><Input name="date" type="date" defaultValue={d} required /></Field>
          <Field label="Time"><Input name="time" type="time" /></Field>
          <Checkbox name="private" label="Private (only me)" />
          <div className="flex justify-end"><SubmitButton>Add event</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "metric" && (
        <ActionForm action={quickMetric} successMessage className="grid grid-cols-3 gap-3">
          <Field label="Metric"><Select name="type" defaultValue="WEIGHT"><option value="WEIGHT">Weight (kg)</option><option value="STEPS">Steps</option><option value="SLEEP_HOURS">Sleep (h)</option><option value="WATER_ML">Water (ml)</option><option value="RESTING_HR">Resting HR</option><option value="ENERGY">Energy 1–5</option><option value="STRESS">Stress 1–5</option></Select></Field>
          <Field label="Value"><Input name="value" inputMode="decimal" required autoFocus /></Field>
          <Field label="Date"><Input name="date" type="date" defaultValue={d} required /></Field>
          <p className="col-span-2 text-xs text-faint">Private to your profile.</p>
          <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "food" && (
        <ActionForm action={quickFood} successMessage className="grid grid-cols-4 gap-3">
          <Field label="What did you eat?" className="col-span-4"><Input name="description" required autoFocus /></Field>
          <Field label="kcal"><Input name="kcal" inputMode="decimal" required /></Field>
          <Field label="Protein g"><Input name="protein" inputMode="decimal" /></Field>
          <Field label="Carbs g"><Input name="carbs" inputMode="decimal" /></Field>
          <Field label="Fat g"><Input name="fat" inputMode="decimal" /></Field>
          <Field label="Meal"><Select name="slot" defaultValue="SNACK"><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option></Select></Field>
          <Field label="Date"><Input name="date" type="date" defaultValue={d} /></Field>
          <Checkbox name="fromLabel" label="From a label" className="col-span-2 self-end" />
          <p className="col-span-4 text-xs text-faint">Manual values are marked as estimates unless taken from a nutrition label. For reference-based nutrition use Food → Nutrition.</p>
          <div className="col-span-4 flex justify-end"><SubmitButton>Log food</SubmitButton></div>
        </ActionForm>
      )}
    </Dialog>
  );
}
