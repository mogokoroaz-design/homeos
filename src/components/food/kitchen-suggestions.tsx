"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChefHat, Lightbulb, Target, Loader2, ShoppingCart, Check } from "lucide-react";
import { Badge } from "../ui";
import { kitchenSuggestionsAction, addSpokenShoppingAction } from "@/app/(app)/food/actions";
import type { Suggestions } from "@/lib/food/suggest";
import { cn } from "@/lib/utils";

/** Fetches suggestions for just-added items (used inside dialogs after adding). */
export function KitchenSuggestions({ names, compact }: { names: string[]; compact?: boolean }) {
  const [s, setS] = useState<Suggestions | null>(null);
  useEffect(() => { let live = true; void kitchenSuggestionsAction(names).then((r) => { if (live) setS(r); }).catch(() => undefined); return () => { live = false; }; }, [names]);
  if (!s) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Kitchen assistant is looking at what you added…</p>;
  return <SuggestionsView s={s} compact={compact} />;
}

function NeedButton({ need }: { need: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  if (!need.length) return null;
  return (
    <button type="button" disabled={state !== "idle"} onClick={async () => { setState("busy"); const r = await addSpokenShoppingAction(need); setState(r.ok ? "done" : "idle"); }}
      className="inline-flex items-center gap-1 text-xs text-info hover:underline disabled:no-underline disabled:opacity-80">
      {state === "busy" ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "done" ? <Check className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />}
      {state === "done" ? "on the list" : `add ${need.join(", ")} to list`}
    </button>
  );
}

export function SuggestionsView({ s }: { s: Suggestions; compact?: boolean }) {
  const hasNext = s.next.picks.length > 0 || Boolean(s.next.note);
  const hasUse = s.useIt.length > 0 || s.ideas.length > 0;
  if (!hasNext && !hasUse) return null;
  return (
    <div className="space-y-5 text-sm" aria-label="Kitchen assistant suggestions">
      {hasNext ? (
        <section className="space-y-2.5">
          <div>
            <p className="flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-info" />What to eat next</p>
            {s.next.remaining ? <p className="mt-0.5 text-xs text-faint">{s.next.eaten.kcal ? `${s.next.eaten.kcal} kcal eaten today · ` : ""}{s.next.remaining.kcal} kcal and {s.next.remaining.protein} g protein left for today</p> : null}
          </div>
          {s.next.picks.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link href={`/food/recipes/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              {p.canCook ? <Badge tone="accent">ready to cook</Badge> : null}
              <span className="w-full text-xs text-muted">{p.kcal} kcal · {p.protein} g protein a serving</span>
            </div>
          ))}
          {s.next.note ? <p className="text-xs text-muted">{s.next.note}</p> : null}
        </section>
      ) : null}
      {hasUse ? (
        <section className="space-y-2.5">
          <p className="flex items-center gap-2 font-medium"><ChefHat className="h-4 w-4 text-accent" />Use what you added{s.forNames.length ? <span className="font-normal text-faint">· {s.forNames.slice(0, 3).join(", ").toLowerCase()}{s.forNames.length > 3 ? "…" : ""}</span> : null}</p>
          {s.useIt.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link href={`/food/recipes/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
              {r.coverage === 1 ? <Badge tone="accent">ready to cook</Badge> : null}
              <span className="w-full text-xs text-faint">your recipe · uses {r.uses.slice(0, 2).join(", ").toLowerCase()}</span>
            </div>
          ))}
          {s.ideas.map((i) => (
            <div key={i.title} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 self-center text-warn" />
              <span className="font-medium">{i.title}</span>
              <Link href={`/food/assistant?q=${encodeURIComponent(`Draft a recipe for ${i.title.toLowerCase()} using ${i.uses.toLowerCase()}`)}`} className="text-xs text-info hover:underline">recipe →</Link>
              <span className="flex w-full flex-wrap items-center gap-x-2 text-xs text-faint">new idea for {i.uses.toLowerCase()}{i.have.length ? ` · you have ${i.have.join(", ")}` : ""}<NeedButton need={i.need} /></span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
