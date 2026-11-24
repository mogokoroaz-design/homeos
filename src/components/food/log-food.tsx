"use client";
import { useState } from "react";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select, Button } from "../ui";
import { FoodPicker } from "./food-picker";
import { logFoodAction } from "@/app/(app)/food/actions";
import { UnitSelect } from "../shell/quick-add";
import { Plus } from "lucide-react";

export function LogFoodDialog({ date }: { date: string }) {
  const [food, setFood] = useState<{ id: string; name: string; defaultUnit: string } | null>(null);
  return (
    <DialogButton label="Log food" icon={<Plus className="h-4 w-4" />} title="Log food from the database" variant="primary" wide>
      {(close) => food ? (
        <ActionForm action={logFoodAction} onSuccess={() => { setFood(null); close(); }} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="foodItemId" value={food.id} />
          <p className="col-span-full font-medium">{food.name} <Button type="button" size="sm" variant="ghost" onClick={() => setFood(null)}>change</Button></p>
          <Field label="Amount"><Input name="quantity" inputMode="decimal" required autoFocus /></Field>
          <Field label="Unit"><UnitSelect defaultValue={food.defaultUnit === "each" ? "each" : "g"} /></Field>
          <Field label="Meal"><Select name="slot" defaultValue="SNACK"><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option></Select></Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={date} /></Field>
          <div className="col-span-full flex justify-end"><SubmitButton>Log</SubmitButton></div>
        </ActionForm>
      ) : <FoodPicker onPick={setFood} />}
    </DialogButton>
  );
}
