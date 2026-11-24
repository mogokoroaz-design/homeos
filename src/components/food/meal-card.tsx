"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CookingPot, MoreHorizontal, Trash2, SkipForward, Replace, MoveRight, RotateCcw } from "lucide-react";
import { Dialog } from "../dialog";
import { ActionCard } from "../assistant/action-card";
import { Badge, Button, Input, Select } from "../ui";
import { setServingAction, deleteMealAction, setMealStatusAction, proposeCookedAction, substitutesAction, substituteMealAction, moveMealAction } from "@/app/(app)/food/actions";
import { cn } from "@/lib/utils";

export interface MealCardData {
  id: string; title: string; slot: string; date: string; status: string; recipeId: string | null; isLeftover: boolean; cookTime: string | null; prepNote: string;
  kcalPerServing: number | null; verified: boolean;
  servings: { profileId: string; name: string; color: string; servings: number; targetKcal: number | null }[];
}

export function MealCard({ meal }: { meal: MealCardData }) {
  const [menu, setMenu] = useState(false);
  const [cook, setCook] = useState<{ actionId: string; preview: unknown } | null>(null);
  const [subs, setSubs] = useState<{ id: string; name: string; shared: number }[] | null>(null);
  const [move, setMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
  return (
    <div className={cn("group rounded-xl border border-line bg-surface-2 p-2.5 text-sm", meal.status === "SKIPPED" && "opacity-50", pending && "opacity-60")}>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          {meal.recipeId ? <Link href={`/food/recipes/${meal.recipeId}`} className={cn("font-medium leading-snug hover:underline", meal.status === "SKIPPED" && "line-through")}>{meal.title}</Link> : <p className="font-medium leading-snug">{meal.title}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {meal.status === "COOKED" ? <Badge tone="accent">cooked</Badge> : null}
            {meal.isLeftover ? <Badge tone="info">leftovers</Badge> : null}
            {meal.cookTime ? <Badge>{meal.cookTime}</Badge> : null}
          </div>
        </div>
        <button type="button" onClick={() => setMenu(!menu)} className="rounded-md p-1 text-faint hover:bg-surface-3 hover:text-ink" aria-label="Meal options"><MoreHorizontal className="h-4 w-4" /></button>
      </div>
      {meal.prepNote ? <p className="mt-1 text-xs text-warn">Prep: {meal.prepNote}</p> : null}
      <div className="mt-2 space-y-1">
        {meal.servings.map((s) => (
          <form key={s.profileId} action={setServingAction} className="flex items-center gap-1.5">
            <input type="hidden" name="mealId" value={meal.id} />
            <input type="hidden" name="profileId" value={s.profileId} />
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.name}</span>
            <input name="servings" defaultValue={s.servings} inputMode="decimal" aria-label={`${s.name} servings`} onBlur={(e) => { if (Number(e.target.value) !== s.servings) e.currentTarget.form?.requestSubmit(); }} className="h-7 w-11 rounded-md border border-line-strong bg-surface px-1 text-center text-xs tabular outline-none focus:border-accent/70" />
            <span className="w-14 text-right text-[11px] tabular text-faint">{meal.kcalPerServing ? `${Math.round(meal.kcalPerServing * s.servings)}${meal.verified ? "" : "~"}` : "—"} kcal</span>
          </form>
        ))}
      </div>
      {menu ? (
        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-line pt-2">
          {meal.status !== "COOKED" ? <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { const r = await proposeCookedAction(meal.id); if (!r.ok) setError(r.error); else if (r.data?.actionId) setCook({ actionId: r.data.actionId, preview: r.data.preview }); setMenu(false); })}><CookingPot className="h-4 w-4" />Cooked</Button> : null}
          {meal.status === "PLANNED" ? <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { await setMealStatusAction(fd({ id: meal.id, status: "SKIPPED" })); setMenu(false); })}><SkipForward className="h-4 w-4" />Skip</Button> : <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { await setMealStatusAction(fd({ id: meal.id, status: "PLANNED" })); setMenu(false); })}><RotateCcw className="h-4 w-4" />Re-plan</Button>}
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { setSubs(await substitutesAction(meal.id)); setMenu(false); })}><Replace className="h-4 w-4" />Substitute</Button>
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => { setMove(true); setMenu(false); }}><MoveRight className="h-4 w-4" />Move</Button>
          <Button size="sm" variant="ghost" className="justify-start text-danger" onClick={() => { if (confirm("Remove this meal from the plan?")) start(async () => { await deleteMealAction(fd({ id: meal.id })); }); }}><Trash2 className="h-4 w-4" />Remove</Button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <Dialog open={Boolean(cook)} onClose={() => setCook(null)} title="Mark as cooked">
        {cook ? <><p className="mb-3 text-sm text-muted">Deduct the ingredients used from the pantry? Quantities are scaled to everyone&apos;s portions plus planned leftovers.</p><ActionCard actionId={cook.actionId} kind="MEAL_COOKED" summary="Deduct ingredients from pantry" preview={cook.preview} onDone={() => setTimeout(() => setCook(null), 900)} /></> : null}
      </Dialog>
      <Dialog open={Boolean(subs)} onClose={() => setSubs(null)} title={`Substitute ${meal.title}`}>
        {subs?.length ? (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <div><p className="font-medium">{s.name}</p><p className="text-xs text-faint">{s.shared ? `${s.shared} shared ingredient(s)` : "similar type"}</p></div>
                <Button size="sm" variant="primary" onClick={() => start(async () => { await substituteMealAction(fd({ id: meal.id, recipeId: s.id })); setSubs(null); })}>Use</Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No other recipes in the library yet.</p>}
      </Dialog>
      <Dialog open={move} onClose={() => setMove(false)} title="Move meal">
        <form action={async (f) => { await moveMealAction(f); setMove(false); }} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="id" value={meal.id} />
          <Input type="date" name="date" defaultValue={meal.date} />
          <Select name="slot" defaultValue={meal.slot}><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option></Select>
          <div className="col-span-2 flex justify-end"><Button type="submit" variant="primary">Move</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
