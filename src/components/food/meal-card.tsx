"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CookingPot, Trash2, SkipForward, Replace, MoveRight, RotateCcw } from "lucide-react";
import { Dialog } from "../dialog";
import { ActionCard } from "../assistant/action-card";
import { Badge, Button, Input, Select } from "../ui";
import { setServingAction, deleteMealAction, setMealStatusAction, proposeCookedAction, substitutesAction, substituteMealAction, moveMealAction } from "@/app/(app)/food/actions";
import { cn } from "@/lib/utils";

export interface MealCardData {
  id: string; title: string; slot: string; date: string; status: string; recipeId: string | null; isLeftover: boolean; cookTime: string | null; prepNote: string;
  kcalPerServing: number | null; verified: boolean; dietWarnings?: string[]; missing?: string[];
  servings: { profileId: string; name: string; color: string; servings: number; targetKcal: number | null }[];
}

export function MealCard({ meal }: { meal: MealCardData }) {
  const [open, setOpen] = useState(false);
  const [cook, setCook] = useState<{ actionId: string; preview: unknown } | null>(null);
  const [subs, setSubs] = useState<{ id: string; name: string; shared: number }[] | null>(null);
  const [move, setMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
  const totalServings = meal.servings.reduce((a, s) => a + s.servings, 0);
  const people = meal.servings.filter((s) => s.servings > 0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${meal.title} — details`}
        className={cn("w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-sm transition hover:border-line-strong hover:bg-surface-3", meal.status === "SKIPPED" && "opacity-50", meal.status === "COOKED" && "border-accent/30", pending && "opacity-60")}>
        <span className={cn("line-clamp-2 font-medium leading-snug", meal.status === "SKIPPED" && "line-through")}>{meal.title}</span>
        <span className="mt-1 flex items-center gap-1">
          {people.map((s) => <span key={s.profileId} className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} title={s.name} />)}
          {meal.status === "COOKED" ? <span className="ml-1 text-[10.5px] text-accent">cooked</span> : meal.isLeftover ? <span className="ml-1 text-[10.5px] text-info">leftovers</span> : meal.cookTime ? <span className="ml-1 text-[10.5px] text-faint">{meal.cookTime}</span> : null}
          {meal.dietWarnings?.length ? <span className="ml-auto text-[10.5px] text-warn" title={meal.dietWarnings.join("; ")}>⚠</span> : null}
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={meal.title}>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{meal.slot.toLowerCase()}</Badge>
            {meal.cookTime ? <Badge>{meal.cookTime}</Badge> : null}
            {meal.status === "COOKED" ? <Badge tone="accent">cooked</Badge> : meal.status === "SKIPPED" ? <Badge>skipped</Badge> : null}
            {meal.isLeftover ? <Badge tone="info">leftovers</Badge> : null}
            {meal.recipeId ? <Link href={`/food/recipes/${meal.recipeId}`} className="ml-auto text-info hover:underline">Open recipe →</Link> : null}
          </div>
          {meal.prepNote ? <p className="text-warn">Prep: {meal.prepNote}</p> : null}
          {meal.dietWarnings?.length ? <p className="text-warn" title="Based on each person's diet preferences (People → Profile)">⚠ {meal.dietWarnings.join("; ")}</p> : null}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-faint">Servings{meal.kcalPerServing ? ` · ${Math.round(meal.kcalPerServing)}${meal.verified ? "" : "~"} kcal each` : ""}</p>
            <div className="space-y-1.5">
              {meal.servings.map((s) => (
                <form key={s.profileId} action={setServingAction} className="flex items-center gap-2">
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="profileId" value={s.profileId} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <input name="servings" defaultValue={s.servings} inputMode="decimal" aria-label={`${s.name} servings`} onBlur={(e) => { if (Number(e.target.value) !== s.servings) e.currentTarget.form?.requestSubmit(); }} className="h-9 w-16 rounded-lg border border-line-strong bg-surface-2 px-2 text-center tabular outline-none focus:border-accent/70" />
                  <span className="w-20 text-right text-xs tabular text-faint">{meal.kcalPerServing ? `${Math.round(meal.kcalPerServing * s.servings)}${meal.verified ? "" : "~"} kcal` : "— kcal"}</span>
                </form>
              ))}
            </div>
            <p className="mt-1 text-xs text-faint">{totalServings} serving{totalServings === 1 ? "" : "s"} in total. Changing a number updates the shopping list.</p>
          </div>
          {meal.status === "PLANNED" && meal.missing?.length ? (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="mb-1 font-medium">Still to buy for this meal</p>
              <p className="text-muted">{meal.missing.join(", ")}</p>
              <Link href="/food/grocery" className="mt-1 inline-block text-xs text-info hover:underline">Already on your shopping list →</Link>
            </div>
          ) : meal.status === "PLANNED" && meal.recipeId ? <p className="text-xs text-accent">You have everything for this meal.</p> : null}
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-3">
            {meal.status !== "COOKED" ? <Button size="sm" variant="secondary" className="justify-start" onClick={() => start(async () => { const r = await proposeCookedAction(meal.id); if (!r.ok) setError(r.error); else if (r.data?.actionId) { setCook({ actionId: r.data.actionId, preview: r.data.preview }); setOpen(false); } })}><CookingPot className="h-4 w-4" />Cooked</Button> : null}
            {meal.status === "PLANNED" ? <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { await setMealStatusAction(fd({ id: meal.id, status: "SKIPPED" })); setOpen(false); })}><SkipForward className="h-4 w-4" />Skip</Button> : <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { await setMealStatusAction(fd({ id: meal.id, status: "PLANNED" })); setOpen(false); })}><RotateCcw className="h-4 w-4" />Re-plan</Button>}
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => start(async () => { setSubs(await substitutesAction(meal.id)); setOpen(false); })}><Replace className="h-4 w-4" />Substitute</Button>
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => { setMove(true); setOpen(false); }}><MoveRight className="h-4 w-4" />Move</Button>
            <Button size="sm" variant="ghost" className="justify-start text-danger" onClick={() => { if (confirm("Remove this meal from the plan?")) start(async () => { await deleteMealAction(fd({ id: meal.id })); setOpen(false); }); }}><Trash2 className="h-4 w-4" />Remove</Button>
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Dialog>
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
    </>
  );
}
