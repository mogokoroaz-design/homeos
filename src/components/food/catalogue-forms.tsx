"use client";
import { DialogButton } from "../dialog";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Select } from "../ui";
import { FoodPicker } from "./food-picker";
import { updateFoodItemAction } from "@/app/(app)/food/actions";
import { FOOD_CATEGORIES } from "@/lib/food/categories";

export interface FoodRow { id: string; name: string; category: string; defaultUnit: string; gramsPerMl: number | null; gramsPerEach: number | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null; barcode: string | null; source: string | null }

export function LinkReferenceDialog({ food }: { food: FoodRow }) {
  return (
    <DialogButton label={food.source === "USDA_SR28" ? "Re-link" : "Link USDA"} title={`Link “${food.name}” to USDA reference`} variant="outline" size="sm" wide>
      {(close) => <FoodPicker mode="link" linkFoodId={food.id} defaultQuery={food.name} onPick={() => setTimeout(close, 400)} />}
    </DialogButton>
  );
}

export function EditFoodDialog({ food }: { food: FoodRow }) {
  return (
    <DialogButton label="Edit" title={`Edit ${food.name}`} variant="ghost" size="sm" wide>
      {(close) => (
        <ActionForm action={updateFoodItemAction} onSuccess={close} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={food.id} />
          <Field label="Name" className="col-span-2"><Input name="name" defaultValue={food.name} required /></Field>
          <Field label="Category"><Select name="category" defaultValue={food.category}>{FOOD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Shopping unit"><Select name="defaultUnit" defaultValue={food.defaultUnit}><option value="g">g</option><option value="ml">ml</option><option value="each">each</option></Select></Field>
          <Field label="Grams per ml" hint="density, for cup/tbsp"><Input name="gramsPerMl" inputMode="decimal" defaultValue={food.gramsPerMl ?? ""} /></Field>
          <Field label="Grams per item"><Input name="gramsPerEach" inputMode="decimal" defaultValue={food.gramsPerEach ?? ""} /></Field>
          <Field label="Barcode"><Input name="barcode" defaultValue={food.barcode ?? ""} /></Field>
          <Field label="Also known as" hint="comma separated"><Input name="alias" placeholder="e.g. chicken thighs" /></Field>
          <div className="col-span-full mt-2 border-t border-line pt-3"><p className="text-sm font-medium">Nutrition values</p><p className="text-xs text-faint">Only change these from a product label, or mark them as your own estimate.</p></div>
          <Field label="Values are…" className="col-span-2"><Select name="source" defaultValue="KEEP"><option value="KEEP">Keep current values ({food.source ?? "none"})</option><option value="LABEL">From a nutrition label (verified)</option><option value="USER_ESTIMATE">My estimate (unverified)</option></Select></Field>
          <Field label="per … grams" hint="label serving size; 100 if per 100 g"><Input name="labelGrams" inputMode="decimal" defaultValue="100" /></Field>
          <div />
          <Field label="kcal"><Input name="kcal" inputMode="decimal" defaultValue={food.kcal ?? ""} /></Field>
          <Field label="Protein g"><Input name="protein" inputMode="decimal" defaultValue={food.protein ?? ""} /></Field>
          <Field label="Carbs g"><Input name="carbs" inputMode="decimal" defaultValue={food.carbs ?? ""} /></Field>
          <Field label="Fat g"><Input name="fat" inputMode="decimal" defaultValue={food.fat ?? ""} /></Field>
          <Field label="Fibre g"><Input name="fibre" inputMode="decimal" defaultValue={food.fibre ?? ""} /></Field>
          <div className="col-span-full flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
