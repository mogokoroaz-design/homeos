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

export function SuggestionsView({ s, compact }: { s: Suggestions; compact?: boolean }) {
  const empty = !s.useIt.length && !s.ideas.length && !s.next.picks.length && !s.next.note;
  if (empty) return null;
  return (
    <div className={cn("grid gap-4 text-sm", !compact && "lg:grid-cols-3")} aria-label="Kitchen assistant suggestions">
      {s.useIt.length || s.ideas.length ? (
        <section className={cn("space-y-2", !compact && "lg:col-span-2")}>
          <p className="flex items-center gap-2 font-medium"><ChefHat className="h-4 w-4 text-accent" />Use {s.forNames.slice(0, 3).join(", ")}{s.forNames.length > 3 ? "…" : ""}</p>
          {s.useIt.length ? (
            <ul className="space-y-1.5">
              {s.useIt.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/food/recipes/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link>
                  {r.coverage === 1 ? <Badge tone="accent">you have everything</Badge> : <Badge tone="warn">missing {r.missing.slice(0, 2).join(", ")}{r.missing.length > 2 ? "…" : ""}</Badge>}
                  <span className="text-xs text-faint">your recipe · uses {r.uses.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.ideas.length ? (
            <ul className="space-y-1.5">
              {s.ideas.map((i) => (
                <li key={i.title} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Lightbulb className="h-3.5 w-3.5 text-warn" />
                  <span className="font-medium">{i.title}</span>
                  <span className="text-xs text-faint">new idea for {i.uses.toLowerCase()}{i.have.length ? ` · you have ${i.have.join(", ")}` : ""}{i.need.length ? ` · need ${i.need.join(", ")}` : ""}</span>
                  <NeedButton need={i.need} />
                  <Link href={`/food/assistant?q=${encodeURIComponent(`Draft a recipe for ${i.title.toLowerCase()} using ${i.uses.toLowerCase()}`)}`} className="text-xs text-info hover:underline">recipe →</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {s.next.picks.length || s.next.note ? (
        <section className="space-y-2">
          <p className="flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-info" />What to eat next</p>
          {s.next.remaining ? <p className="text-xs text-faint">Today: {s.next.eaten.kcal} kcal and {s.next.eaten.protein} g protein logged · {s.next.remaining.kcal} kcal, {s.next.remaining.protein} g protein to go</p> : null}
          {s.next.picks.map((p) => (
            <div key={p.id}>
              <Link href={`/food/recipes/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              <p className="text-xs text-muted">{p.reason}</p>
            </div>
          ))}
          {s.next.note ? <p className="text-xs text-muted">{s.next.note}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
