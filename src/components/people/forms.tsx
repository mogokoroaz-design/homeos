"use client";
import { useState, useTransition } from "react";
import { Plus, Calculator, Loader2 } from "lucide-react";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Textarea, Button } from "../ui";
import { ActionCard } from "../assistant/action-card";
import { updateProfileAction, setTargetsAction, proposeTargetsAction, addMetricAction, addWorkoutAction, createHabitAction, createRoutineAction } from "@/app/(app)/people/actions";
import { today } from "@/lib/dates";
import { parseDietPrefs, describeDiet } from "@/lib/food/diet";

function DietField({ defaultValue }: { defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  const understood = describeDiet(parseDietPrefs(v));
  return (
    <Field label="Diet & allergies" className="col-span-2" hint={understood.length ? <>Meal plans will follow: <span className="text-accent">{understood.join(" · ")}</span></> : "e.g. vegetarian, gluten free, no shellfish, allergic to peanuts, avoid mushrooms"}>
      <Input name="dietPreferences" value={v} onChange={(e) => setV(e.target.value)} placeholder="vegetarian, no shellfish…" />
    </Field>
  );
}

export function ProfileForm({ p }: { p: { birthDate: string | null; sex: string | null; heightCm: number | null; goalWeightKg: number | null; activityLevel: string; goal: string; dietPreferences: string; fitnessGoals: string } }) {
  return (
    <ActionForm action={updateProfileAction} resetOnSuccess={false} successMessage className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Birth date"><Input type="date" name="birthDate" defaultValue={p.birthDate ?? ""} /></Field>
      <Field label="Sex (for BMR)" hint="optional"><Select name="sex" defaultValue={p.sex ?? "unspecified"}><option value="unspecified">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></Select></Field>
      <Field label="Height (cm)"><Input name="heightCm" inputMode="decimal" defaultValue={p.heightCm ?? ""} /></Field>
      <Field label="Goal weight (kg)"><Input name="goalWeightKg" inputMode="decimal" defaultValue={p.goalWeightKg ?? ""} /></Field>
      <Field label="Activity level"><Select name="activityLevel" defaultValue={p.activityLevel}><option value="sedentary">Sedentary</option><option value="light">Lightly active</option><option value="moderate">Moderately active</option><option value="active">Very active</option><option value="very_active">Extremely active</option></Select></Field>
      <Field label="Goal"><Select name="goal" defaultValue={p.goal}><option value="lose">Lose weight</option><option value="maintain">Maintain</option><option value="gain">Gain weight</option></Select></Field>
      <DietField defaultValue={p.dietPreferences} />
      <Field label="Fitness goals" className="col-span-full"><Textarea name="fitnessGoals" defaultValue={p.fitnessGoals} className="min-h-16" /></Field>
      <div className="col-span-full flex justify-end"><SubmitButton>Save profile</SubmitButton></div>
    </ActionForm>
  );
}

export function TargetsForm({ t }: { t: { kcal: number; protein: number; carbs: number; fat: number; fibre: number } | null }) {
  const [proposal, setProposal] = useState<{ actionId: string; preview: unknown } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ActionForm action={setTargetsAction} resetOnSuccess={false} successMessage className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="kcal"><Input name="kcal" inputMode="numeric" defaultValue={t?.kcal ?? ""} required /></Field>
        <Field label="Protein g"><Input name="protein" inputMode="numeric" defaultValue={t?.protein ?? ""} required /></Field>
        <Field label="Carbs g"><Input name="carbs" inputMode="numeric" defaultValue={t?.carbs ?? ""} required /></Field>
        <Field label="Fat g"><Input name="fat" inputMode="numeric" defaultValue={t?.fat ?? ""} required /></Field>
        <Field label="Fibre g"><Input name="fibre" inputMode="numeric" defaultValue={t?.fibre ?? ""} /></Field>
        <div className="flex items-end"><SubmitButton className="w-full">Set</SubmitButton></div>
      </ActionForm>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await proposeTargetsAction(); if (r.ok) setProposal(r.data!); else setErr(r.error); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}Estimate from my profile</Button>
        <p className="text-xs text-faint">Mifflin–St Jeor BMR × activity factor, ±goal adjustment; macros 25/45/30 % of energy. A proposal — you approve it.</p>
      </div>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      {proposal ? <ActionCard actionId={proposal.actionId} kind="NUTRITION_TARGETS" summary="Apply estimated targets" preview={proposal.preview} /> : null}
    </div>
  );
}

export function MetricForm() {
  return (
    <ActionForm action={addMetricAction} className="flex flex-wrap items-end gap-2">
      <Field label="Metric"><Select name="type" defaultValue="WEIGHT" className="w-44"><option value="WEIGHT">Weight (kg)</option><option value="STEPS">Steps</option><option value="SLEEP_HOURS">Sleep (hours)</option><option value="WATER_ML">Water (ml)</option><option value="RESTING_HR">Resting HR (bpm)</option><option value="ACTIVE_KCAL">Active energy (kcal)</option><option value="ENERGY">Energy (1–5)</option><option value="STRESS">Stress (1–5)</option></Select></Field>
      <Field label="Value"><Input name="value" inputMode="decimal" required className="w-28" /></Field>
      <Field label="Date"><Input type="date" name="date" defaultValue={today()} className="w-40" /></Field>
      <SubmitButton>Log</SubmitButton>
    </ActionForm>
  );
}

export function WorkoutDialog() {
  return (
    <DialogButton label="Log workout" icon={<Plus className="h-4 w-4" />} title="Log workout" variant="secondary" size="sm">
      {(close) => (
        <ActionForm action={addWorkoutAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Type"><Input name="type" required list="wo-types" placeholder="Run" /></Field>
          <datalist id="wo-types">{["Walk", "Run", "Cycle", "Swim", "Strength", "Yoga", "Pilates", "HIIT", "Sport", "Hike"].map((t) => <option key={t} value={t} />)}</datalist>
          <Field label="Date"><Input type="date" name="date" defaultValue={today()} /></Field>
          <Field label="Duration (min)"><Input name="duration" inputMode="numeric" required /></Field>
          <Field label="Distance (km)"><Input name="distance" inputMode="decimal" /></Field>
          <Field label="Intensity"><Select name="intensity" defaultValue="moderate"><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></Select></Field>
          <Field label="kcal burned" hint="from your device, optional"><Input name="kcal" inputMode="numeric" /></Field>
          <Field label="Notes" className="col-span-2"><Input name="notes" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function HabitForm() {
  return (
    <ActionForm action={createHabitAction} className="flex flex-wrap items-end gap-2">
      <Field label="New habit"><Input name="name" required placeholder="Drink 2 L water" className="w-56" /></Field>
      <Field label="Times / week"><Input name="target" inputMode="numeric" defaultValue="7" className="w-24" /></Field>
      <SubmitButton variant="secondary">Add</SubmitButton>
    </ActionForm>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function RoutineDialog() {
  return (
    <DialogButton label="New routine" icon={<Plus className="h-4 w-4" />} title="Personal routine" variant="secondary" size="sm">
      {(close) => (
        <ActionForm action={createRoutineAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><Input name="name" required placeholder="Morning routine" /></Field>
          <Field label="Part of day"><Select name="timeOfDay" defaultValue="MORNING"><option value="MORNING">Morning</option><option value="MIDDAY">Midday</option><option value="EVENING">Evening</option><option value="ANY">Any time</option></Select></Field>
          <Field label="Time"><Input type="time" name="time" /></Field>
          <div className="col-span-2"><p className="mb-1.5 text-[13px] font-medium text-muted">Days (none = every day)</p><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <label key={d} className="flex cursor-pointer items-center rounded-lg border border-line-strong px-2.5 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-dim"><input type="checkbox" name="weekday" value={i} className="sr-only" />{d}</label>)}</div></div>
          <Field label="Steps (one per line)" className="col-span-2"><Textarea name="steps" placeholder={"Stretch\nGlass of water\nJournal"} /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Create</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
