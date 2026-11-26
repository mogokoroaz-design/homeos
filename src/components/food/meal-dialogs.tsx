"use client";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select } from "../ui";
import { addMealAction } from "@/app/(app)/food/actions";
import { CalendarPlus, Plus } from "lucide-react";
import { useState } from "react";
import { MealCheckPanel } from "./meal-check";
import type { MealCheck } from "@/lib/food/meal-check";

export function AddMealDialog({ recipes, profiles, date, slot, recipeId, label = "Add meal", variant = "secondary", size = "md", iconOnly }: {
  recipes: { id: string; name: string }[]; profiles: { id: string; name: string }[]; date: string; slot?: string; recipeId?: string; label?: string; variant?: "secondary" | "primary" | "ghost" | "outline"; size?: "sm" | "md"; iconOnly?: boolean;
}) {
  return (
    <DialogButton label={iconOnly ? <Plus className="h-4 w-4" /> : label} icon={iconOnly ? undefined : <CalendarPlus className="h-4 w-4" />} title="Add to meal plan" variant={variant} size={iconOnly ? "iconSm" : size}>
      {(close) => <AddMealForm close={close} recipes={recipes} profiles={profiles} date={date} slot={slot} recipeId={recipeId} />}
    </DialogButton>
  );
}

function AddMealForm({ close, recipes, profiles, date, slot, recipeId }: { close: () => void; recipes: { id: string; name: string }[]; profiles: { id: string; name: string }[]; date: string; slot?: string; recipeId?: string }) {
  const [check, setCheck] = useState<MealCheck | null>(null);
  if (check) return <MealCheckPanel check={check} onDone={close} />;
  return (
        <ActionForm action={addMealAction} onSuccess={(r) => { const c = r.ok ? (r.data as { check: MealCheck | null } | undefined)?.check : null; if (c) setCheck(c); else close(); }} className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" name="date" defaultValue={date} required /></Field>
          <Field label="Meal"><Select name="slot" defaultValue={slot ?? "DINNER"}><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option></Select></Field>
          <Field label="Recipe" className="col-span-2"><Select name="recipeId" defaultValue={recipeId ?? ""}><option value="">— No recipe (enter a name) —</option>{recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="…or meal name" className="col-span-2"><Input name="title" placeholder="e.g. Eating out" /></Field>
          {profiles.map((p) => <Field key={p.id} label={`${p.name}'s servings`} hint="Blank = from their calorie target"><Input name={`serv_${p.id}`} inputMode="decimal" placeholder="auto" /></Field>)}
          <Field label="Cook at"><Input type="time" name="cookTime" /></Field>
          <Field label="Extra servings for leftovers" hint="Adds tomorrow's lunch"><Input name="leftovers" inputMode="decimal" placeholder="0" /></Field>
          <Field label="Prep note" className="col-span-2" hint="Shows on the calendar, e.g. “marinate night before”"><Input name="prepNote" /></Field>
          <Field label="Notes" className="col-span-2"><Input name="notes" /></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Add to plan</SubmitButton></div>
        </ActionForm>
  );
}
