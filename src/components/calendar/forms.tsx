"use client";
import { Plus } from "lucide-react";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Textarea, Checkbox } from "../ui";
import { ScheduleFields } from "../home/forms";
import { createEventAction, createReminderAction } from "@/app/(app)/calendar/actions";

export function EventDialog({ date }: { date: string }) {
  return (
    <DialogButton label="New event" icon={<Plus className="h-4 w-4" />} title="New event" variant="primary">
      {(close) => (
        <ActionForm action={createEventAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><Input name="title" required /></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={date} required /></Field>
          <Field label="Type"><Select name="kind" defaultValue="HOUSEHOLD"><option value="HOUSEHOLD">Household</option><option value="APPOINTMENT">Appointment</option><option value="PERSONAL">Personal</option><option value="EXERCISE">Exercise</option><option value="FOOD_PREP">Food prep</option></Select></Field>
          <Field label="Start"><Input type="time" name="startTime" /></Field>
          <Field label="End"><Input type="time" name="endTime" /></Field>
          <ScheduleFields />
          <Field label="Details" className="col-span-2"><Textarea name="description" className="min-h-16" /></Field>
          <Checkbox name="private" label="Private — only visible to me" className="col-span-2" />
          <div className="col-span-2 flex justify-end"><SubmitButton>Add event</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ReminderDialog({ date }: { date: string }) {
  return (
    <DialogButton label="Reminder" icon={<Plus className="h-4 w-4" />} title="New reminder" variant="secondary">
      {(close) => (
        <ActionForm action={createReminderAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Remind me to…" className="col-span-2"><Input name="title" required /></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={date} required /></Field>
          <Field label="Time"><Input type="time" name="time" /></Field>
          <Checkbox name="private" label="Private" />
          <div className="flex justify-end"><SubmitButton>Add</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
