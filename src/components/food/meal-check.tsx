"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, Check, Loader2, ShoppingCart, Home } from "lucide-react";
import { Button } from "../ui";
import { confirmHaveIngredientsAction, mealCheckAction } from "@/app/(app)/food/actions";
import type { MealCheck } from "@/lib/food/meal-check";
import { notifyFoodChanged } from "./kitchen-bubble";
import { cn } from "@/lib/utils";

const LABEL = { unrecorded: "Not in your pantry records", out: "Ran out", short: "Not enough" } as const;
const HINT = {
  unrecorded: "HomeOS has never recorded these, so it can't tell whether you have them.",
  out: "You had these before; the pantry now shows none.",
  short: "You have some, but less than this meal needs.",
} as const;

/** The kitchen assistant's ingredient check for a planned meal: Buy or "I have it" per item. */
export function MealCheckPanel({ check, onDone, doneLabel = "Done" }: { check: MealCheck; onDone?: () => void; doneLabel?: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, "buy" | "have">>(() => Object.fromEntries(check.issues.map((i) => [i.name, "buy"])));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = () => start(async () => {
    const have = check.issues.filter((i) => choice[i.name] === "have");
    const r = await confirmHaveIngredientsAction(have.map((i) => ({ name: i.name, foodItemId: i.foodItemId, need: i.need, unit: i.unit })));
    if (!r.ok) { setMsg(r.error); return; }
    if (have.length) notifyFoodChanged();
    router.refresh();
    onDone?.();
  });
  if (!check.issues.length) {
    return (
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2 text-accent"><Check className="h-4 w-4" />You have everything for {check.title} ({check.haveCount} ingredient{check.haveCount === 1 ? "" : "s"}).</p>
        {onDone ? <div className="flex justify-end"><Button variant="primary" onClick={onDone}>{doneLabel}</Button></div> : null}
      </div>
    );
  }
  const groups = (["unrecorded", "out", "short"] as const).map((k) => [k, check.issues.filter((i) => i.status === k)] as const).filter(([, l]) => l.length);
  return (
    <div className="space-y-4 text-sm" aria-label="Ingredient check">
      <p className="flex items-start gap-2"><ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span><b>Kitchen assistant:</b> {check.issues.length} ingredient{check.issues.length === 1 ? "" : "s"} for {check.title} {check.issues.length === 1 ? "isn't" : "aren't"} covered by the pantry{check.haveCount ? ` (you have the other ${check.haveCount})` : ""}. Buy them, or tell me you have them.</span></p>
      {groups.map(([k, list]) => (
        <div key={k}>
          <p className="font-medium">{LABEL[k]}</p>
          <p className="mb-2 text-xs text-faint">{HINT[k]}</p>
          <ul className="space-y-1.5">
            {list.map((i) => (
              <li key={i.name} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <div className="min-w-32 flex-1">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-faint">needs {i.needText}{i.haveText ? ` · you have ${i.haveText}` : ""}</p>
                </div>
                <div role="radiogroup" aria-label={`${i.name}: buy or have`} className="flex overflow-hidden rounded-lg border border-line-strong text-xs">
                  <button type="button" role="radio" aria-checked={choice[i.name] === "buy"} onClick={() => setChoice({ ...choice, [i.name]: "buy" })} className={cn("flex items-center gap-1 px-2.5 py-1.5", choice[i.name] === "buy" ? "bg-warn-dim text-warn" : "text-muted hover:bg-surface-3")}><ShoppingCart className="h-3.5 w-3.5" />Buy{i.buyText !== "—" ? ` ${i.buyText}` : ""}</button>
                  <button type="button" role="radio" aria-checked={choice[i.name] === "have"} onClick={() => setChoice({ ...choice, [i.name]: "have" })} className={cn("flex items-center gap-1 border-l border-line-strong px-2.5 py-1.5", choice[i.name] === "have" ? "bg-accent-dim text-accent" : "text-muted hover:bg-surface-3")}><Home className="h-3.5 w-3.5" />I have it</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-faint">“Buy” items are on your <Link href="/food/grocery" className="text-info hover:underline">shopping list</Link>. “I have it” records them in the pantry (as estimated) so I stop asking.</p>
      {msg ? <p role="alert" className="text-danger">{msg}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={done} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{doneLabel}</Button>
      </div>
    </div>
  );
}

/** Loads the check for an existing planned meal. */
export function MealCheckLoader({ mealId, onDone }: { mealId: string; onDone?: () => void }) {
  const [check, setCheck] = useState<MealCheck | null | undefined>(undefined);
  useEffect(() => { let live = true; void mealCheckAction(mealId).then((c) => { if (live) setCheck(c); }); return () => { live = false; }; }, [mealId]);
  if (check === undefined) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Checking the pantry…</p>;
  if (check === null) return null;
  return <MealCheckPanel check={check} onDone={onDone} doneLabel="Save" />;
}
