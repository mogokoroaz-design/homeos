"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, ClipboardPaste, Loader2 } from "lucide-react";
import { Field, Input, Textarea, Select, Button, Checkbox, Card } from "../ui";
import { saveRecipeAction } from "@/app/(app)/food/actions";
import { parseIngredientLine } from "@/lib/food/parse";
import { COMMON_UNITS } from "@/lib/units";

export interface EditorIngredient { name: string; quantity: number | null; unit: string; note: string; optional: boolean; foodItemId?: string | null }
export interface EditorRecipe {
  name: string; cuisine: string; category: string; servings: number; prepMinutes: number | null; cookMinutes: number | null; temperature: string;
  instructions: string; sourceType: string; sourceUrl: string | null; notes: string; tags: string; favourite: boolean; ingredients: EditorIngredient[];
  variantOfId?: string | null;
}

export const EMPTY_RECIPE: EditorRecipe = { name: "", cuisine: "", category: "main", servings: 2, prepMinutes: null, cookMinutes: null, temperature: "", instructions: "", sourceType: "MANUAL", sourceUrl: null, notes: "", tags: "", favourite: false, ingredients: [] };
const CATS = ["breakfast", "main", "side", "salad", "soup", "snack", "dessert", "drink", "sauce", "other"];

export function RecipeEditor({ initial, id, importId, onSavedHref }: { initial: EditorRecipe; id?: string; importId?: string; onSavedHref?: string }) {
  const [r, setR] = useState<EditorRecipe>(initial);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(!initial.ingredients.length);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof EditorRecipe>(k: K, v: EditorRecipe[K]) => setR((x) => ({ ...x, [k]: v }));
  const setIng = (i: number, patch: Partial<EditorIngredient>) => set("ingredients", r.ingredients.map((x, j) => (j === i ? { ...x, ...patch, ...(patch.name !== undefined ? { foodItemId: null } : {}) } : x)));
  const move = (i: number, d: -1 | 1) => { const a = [...r.ingredients]; const t = a[i + d]; if (!t) return; a[i + d] = a[i]; a[i] = t; set("ingredients", a); };
  const parsePaste = (text: string): EditorIngredient[] => text.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => { const p = parseIngredientLine(l); return { name: p.name, quantity: p.quantity, unit: p.unit, note: p.note, optional: p.optional }; })
    .filter((i) => i.name.trim());
  const addPasted = () => {
    set("ingredients", [...r.ingredients, ...parsePaste(paste)]);
    setPaste("");
    setShowPaste(false);
  };
  const save = () => start(async () => {
    setError(null);
    // Lines typed in the box but not yet "Parse & add"-ed are included, and empty rows are skipped.
    const ingredients = [...r.ingredients.filter((i) => i.name.trim()), ...parsePaste(paste)];
    const res = await saveRecipeAction(JSON.stringify({ ...r, ingredients }), id, importId);
    if (!res.ok) { setError(res.error); return; }
    router.push(onSavedHref ?? `/food/recipes/${res.data!.id}`);
    router.refresh();
  });
  return (
    <div className="space-y-5">
      <Card className="grid gap-4 p-5 sm:grid-cols-6">
        <Field label="Recipe name" className="sm:col-span-4"><Input value={r.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="Category" className="sm:col-span-2"><Select value={r.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Cuisine" className="sm:col-span-2"><Input value={r.cuisine} onChange={(e) => set("cuisine", e.target.value)} /></Field>
        <Field label="Servings"><Input inputMode="decimal" value={r.servings} onChange={(e) => set("servings", Number(e.target.value) || 0)} /></Field>
        <Field label="Prep (min)"><Input inputMode="numeric" value={r.prepMinutes ?? ""} onChange={(e) => set("prepMinutes", e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="Cook (min)"><Input inputMode="numeric" value={r.cookMinutes ?? ""} onChange={(e) => set("cookMinutes", e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="Temperature"><Input value={r.temperature} onChange={(e) => set("temperature", e.target.value)} placeholder="200°C" /></Field>
        <Field label="Tags" className="sm:col-span-3"><Input value={r.tags} onChange={(e) => set("tags", e.target.value)} placeholder="quick, weeknight" /></Field>
        <Field label="Source link" className="sm:col-span-3"><Input value={r.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value || null)} /></Field>
        <Checkbox label="Favourite" checked={r.favourite} onChange={(e) => set("favourite", e.target.checked)} className="sm:col-span-6" />
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Ingredients</h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowPaste(!showPaste)}><ClipboardPaste className="h-4 w-4" />Paste lines</Button>
            <Button type="button" size="sm" onClick={() => set("ingredients", [...r.ingredients, { name: "", quantity: null, unit: "g", note: "", optional: false }])}><Plus className="h-4 w-4" />Add</Button>
          </div>
        </div>
        {showPaste ? (
          <div className="mb-4 space-y-2 rounded-xl bg-surface-2 p-3">
            <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Ingredients, one per line" placeholder={"One ingredient per line, e.g.\n500 g chicken thighs, boneless\n2 tbsp olive oil\n4 cloves garlic"} className="min-h-28" />
            <div className="flex justify-end"><Button type="button" size="sm" variant="primary" onClick={addPasted} disabled={!paste.trim()}>Parse &amp; add</Button></div>
            <p className="text-xs text-faint">Lines left here are added automatically when you save.</p>
          </div>
        ) : null}
        <div className="space-y-2">
          {r.ingredients.map((ing, i) => (
            <div key={i} className="grid grid-cols-[72px_96px_1fr_auto] items-center gap-2 sm:grid-cols-[80px_110px_1fr_1fr_auto]">
              <Input aria-label="Quantity" inputMode="decimal" value={ing.quantity ?? ""} onChange={(e) => setIng(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })} className="h-10 px-2.5" placeholder="qty" />
              <Select aria-label="Unit" value={ing.unit} onChange={(e) => setIng(i, { unit: e.target.value })} className="h-10 px-2.5">
                <option value="">—</option>
                {[...new Set([...COMMON_UNITS, ing.unit].filter(Boolean))].map((u) => <option key={u}>{u}</option>)}
              </Select>
              <Input aria-label="Ingredient" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} className="h-10" placeholder="ingredient" />
              <Input aria-label="Note" value={ing.note} onChange={(e) => setIng(i, { note: e.target.value })} className="col-span-3 h-10 sm:col-span-1" placeholder="note (chopped…)" />
              <div className="col-start-4 row-start-1 flex items-center sm:col-start-auto sm:row-start-auto">
                <label className="mr-1 flex items-center gap-1 text-xs text-faint" title="Optional"><input type="checkbox" checked={ing.optional} onChange={(e) => setIng(i, { optional: e.target.checked })} className="accent-[#9cc2b0]" />opt</label>
                <button type="button" onClick={() => move(i, -1)} className="p-1.5 text-faint hover:text-ink" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1.5 text-faint hover:text-ink" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => set("ingredients", r.ingredients.filter((_, j) => j !== i))} className="p-1.5 text-faint hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {!r.ingredients.length && !paste.trim() ? <p className="text-sm text-faint">No ingredients yet — type them in the box above (one per line) or press Add.</p> : null}
        </div>
        <p className="mt-3 text-xs text-faint">Ingredients are matched to your ingredient catalogue. Nutrition is calculated from linked USDA reference data or label values — never invented.</p>
      </Card>

      <Card className="grid gap-4 p-5">
        <Field label="Instructions" hint="One step per line"><Textarea value={r.instructions} onChange={(e) => set("instructions", e.target.value)} className="min-h-40" /></Field>
        <Field label="Personal notes"><Textarea value={r.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-20" /></Field>
      </Card>
      {error ? <p role="alert" className="rounded-lg border border-[#55302d] bg-danger-dim px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="button" variant="primary" onClick={save} disabled={pending || !r.name.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save recipe</Button>
      </div>
    </div>
  );
}
