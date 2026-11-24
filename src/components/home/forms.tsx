"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Textarea, Checkbox } from "../ui";
import { createTaskAction, saveProviderAction, scheduleVisitAction, completeVisitAction, saveAssetAction, recordMaintenanceAction } from "@/app/(app)/home/actions";
import { today } from "@/lib/dates";

const CATS = ["CLEANING", "GARDENING", "MAINTENANCE", "LAUNDRY", "KITCHEN", "ERRAND", "OTHER"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

export function ScheduleFields() {
  const [freq, setFreq] = useState("NONE");
  return (
    <>
      <Field label="Repeats"><Select name="freq" value={freq} onChange={(e) => setFreq(e.target.value)}><option value="NONE">Doesn&apos;t repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></Select></Field>
      {freq !== "NONE" ? <Field label="Every" hint={freq === "WEEKLY" ? "weeks" : freq === "DAILY" ? "days" : freq === "MONTHLY" ? "months" : "years"}><Input name="interval" inputMode="numeric" defaultValue="1" /></Field> : <div />}
      {freq === "WEEKLY" ? <div className="col-span-full"><p className="mb-1.5 text-[13px] font-medium text-muted">On</p><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-dim"><input type="checkbox" name="weekday" value={i} className="sr-only" />{d}</label>)}</div></div> : null}
      {freq === "MONTHLY" ? <Field label="Day of month"><Input name="dayOfMonth" inputMode="numeric" placeholder="same as start" /></Field> : null}
      {freq !== "NONE" ? <Field label="Ends (optional)"><Input type="date" name="endDate" /></Field> : null}
    </>
  );
}

export function NewTaskDialog({ profiles, defaultCategory = "CLEANING" }: { profiles: { id: string; name: string }[]; defaultCategory?: string }) {
  return (
    <DialogButton label="New task" icon={<Plus className="h-4 w-4" />} title="New household task" variant="primary">
      {(close) => (
        <ActionForm action={createTaskAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Task" className="col-span-2"><Input name="title" required placeholder="e.g. Clean bathroom" /></Field>
          <Field label="Category"><Select name="category" defaultValue={defaultCategory}>{CATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select></Field>
          <Field label="Room / area"><Input name="area" placeholder="Kitchen, garden…" /></Field>
          <Field label="First due"><Input type="date" name="dueDate" defaultValue={today()} /></Field>
          <Field label="Time"><Input type="time" name="dueTime" /></Field>
          <ScheduleFields />
          <Field label="Assigned to"><Select name="assignee" defaultValue=""><option value="">Anyone</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Checkbox name="deepClean" label="Deep clean" className="self-end" />
          <Field label="Details" className="col-span-2"><Textarea name="description" className="min-h-16" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Create task</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export interface ProviderRow { id: string; name: string; kind: string; phone: string; email: string; notes: string; rate: string; rateUnit: string }
export function ProviderDialog({ provider }: { provider?: ProviderRow }) {
  return (
    <DialogButton label={provider ? "Edit" : "Add provider"} icon={provider ? undefined : <Plus className="h-4 w-4" />} title={provider ? `Edit ${provider.name}` : "New service provider"} variant={provider ? "ghost" : "primary"} size={provider ? "sm" : "md"}>
      {(close) => (
        <ActionForm action={saveProviderAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          {provider ? <input type="hidden" name="id" value={provider.id} /> : null}
          <Field label="Name" className="col-span-2"><Input name="name" defaultValue={provider?.name} required /></Field>
          <Field label="Type"><Select name="kind" defaultValue={provider?.kind ?? "CLEANER"}>{["CLEANER", "GARDENER", "PLUMBER", "ELECTRICIAN", "REPAIR", "OTHER"].map((k) => <option key={k} value={k}>{cap(k)}</option>)}</Select></Field>
          <Field label="Usual rate"><Input name="rate" inputMode="decimal" defaultValue={provider?.rate} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={provider?.phone} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={provider?.email} /></Field>
          <Field label="Standing instructions & notes" className="col-span-2"><Textarea name="notes" defaultValue={provider?.notes} /></Field>
          <input type="hidden" name="rateUnit" value={provider?.rateUnit ?? "visit"} />
          <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ScheduleVisitDialog({ providerId, rate, label = "Book visit" }: { providerId: string; rate: string; label?: string }) {
  return (
    <DialogButton label={label} title="Schedule a visit" variant="outline" size="sm">
      {(close) => (
        <ActionForm action={scheduleVisitAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="providerId" value={providerId} />
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} required /></Field>
          <Field label="Time"><Input type="time" name="time" /></Field>
          <Field label="Expected payment"><Input name="payment" inputMode="decimal" defaultValue={rate} /></Field>
          <div />
          <Field label="Instructions for this visit" className="col-span-2"><Textarea name="instructions" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Schedule</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function CompleteVisitDialog({ visit, profiles, viewerId }: { visit: { id: string; date: string; payment: string; instructions: string }; profiles: { id: string; name: string }[]; viewerId: string }) {
  return (
    <DialogButton label="Record visit" title="Record completed visit" variant="primary" size="sm">
      {(close) => (
        <ActionForm action={completeVisitAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="visitId" value={visit.id} />
          <Field label="Date of visit"><Input type="date" name="date" defaultValue={visit.date} /></Field>
          <Field label="Amount paid"><Input name="payment" inputMode="decimal" defaultValue={visit.payment} /></Field>
          <Field label="Paid by"><Select name="paidBy" defaultValue={viewerId}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Checkbox name="recordPayment" label="Add payment to household ledger" defaultChecked className="self-end" />
          <Field label="What was done / observations" className="col-span-2"><Textarea name="notes" /></Field>
          <div className="col-span-2 mt-1 border-t border-line pt-3 text-sm font-medium">Next appointment (optional)</div>
          <Field label="Date"><Input type="date" name="nextDate" /></Field>
          <Field label="Time"><Input type="time" name="nextTime" /></Field>
          <Field label="Instructions for next visit" className="col-span-2"><Textarea name="nextInstructions" defaultValue={visit.instructions} className="min-h-16" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Save visit</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function AssetDialog({ asset }: { asset?: { id: string; name: string; location: string; brand: string; model: string; purchaseDate: string | null; warrantyUntil: string | null; notes: string } }) {
  return (
    <DialogButton label={asset ? "Edit" : "Add appliance"} icon={asset ? undefined : <Plus className="h-4 w-4" />} title={asset ? `Edit ${asset.name}` : "Appliance / asset"} variant={asset ? "ghost" : "secondary"} size={asset ? "sm" : "md"}>
      {(close) => (
        <ActionForm action={saveAssetAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          {asset ? <input type="hidden" name="id" value={asset.id} /> : null}
          <Field label="Name" className="col-span-2"><Input name="name" defaultValue={asset?.name} required placeholder="Dishwasher" /></Field>
          <Field label="Location"><Input name="location" defaultValue={asset?.location} /></Field>
          <Field label="Brand"><Input name="brand" defaultValue={asset?.brand} /></Field>
          <Field label="Model"><Input name="model" defaultValue={asset?.model} /></Field>
          <Field label="Purchased"><Input type="date" name="purchaseDate" defaultValue={asset?.purchaseDate ?? ""} /></Field>
          <Field label="Warranty until"><Input type="date" name="warrantyUntil" defaultValue={asset?.warrantyUntil ?? ""} /></Field>
          <Field label="Notes" className="col-span-2"><Textarea name="notes" defaultValue={asset?.notes} className="min-h-16" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function MaintenanceDialog({ assets, providers }: { assets: { id: string; name: string }[]; providers: { id: string; name: string }[] }) {
  return (
    <DialogButton label="Record maintenance" icon={<Plus className="h-4 w-4" />} title="Maintenance record" variant="primary">
      {(close) => (
        <ActionForm action={recordMaintenanceAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="What was done" className="col-span-2"><Input name="title" required placeholder="Replaced kitchen tap washer" /></Field>
          <Field label="Type"><Select name="kind" defaultValue="REPAIR">{["APPLIANCE", "PLUMBING", "ELECTRICAL", "REPAIR", "OTHER"].map((k) => <option key={k} value={k}>{cap(k)}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} required /></Field>
          <Field label="Appliance"><Select name="assetId" defaultValue=""><option value="">—</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Provider"><Select name="providerId" defaultValue=""><option value="">Did it ourselves</option>{providers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Cost"><Input name="cost" inputMode="decimal" /></Field>
          <Field label="Next service due"><Input type="date" name="nextDueDate" /></Field>
          <Checkbox name="recordExpense" label="Add cost to the household ledger" defaultChecked className="col-span-2" />
          <Field label="Notes" className="col-span-2"><Textarea name="notes" className="min-h-16" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
