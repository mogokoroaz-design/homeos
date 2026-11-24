"use client";
import { useEffect, useState, useTransition } from "react";
import { Search, Loader2, Database } from "lucide-react";
import { Input, Badge, Button } from "../ui";
import { searchFoodsAction, createFromReferenceAction, linkReferenceAction } from "@/app/(app)/food/actions";

type Result = Awaited<ReturnType<typeof searchFoodsAction>>;

/** Search the household catalogue and the bundled USDA SR28 reference. */
export function FoodPicker({ onPick, mode = "pick", linkFoodId, defaultQuery = "" }: { onPick?: (f: { id: string; name: string; defaultUnit: string }) => void; mode?: "pick" | "link"; linkFoodId?: string; defaultQuery?: string }) {
  const [q, setQ] = useState(defaultQuery);
  const [res, setRes] = useState<Result>({ catalogue: [], reference: [] });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => start(async () => setRes(await searchFoodsAction(q))), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods (e.g. chicken thigh raw)" className="pl-9" autoFocus />
        {pending ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-faint" /> : null}
      </div>
      {mode === "pick" && res.catalogue.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Your ingredients</p>
          <ul className="space-y-1">{res.catalogue.map((f) => (
            <li key={f.id}><button type="button" onClick={() => onPick?.({ id: f.id, name: f.name, defaultUnit: f.defaultUnit })} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3">
              <span>{f.name}</span>{f.kcal !== null ? <Badge tone={f.source === "USDA_SR28" || f.source === "LABEL" ? "accent" : "neutral"}>{Math.round(f.kcal)} kcal/100g</Badge> : <Badge>no nutrition</Badge>}
            </button></li>
          ))}</ul>
        </div>
      ) : null}
      {res.reference.length ? (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint"><Database className="h-3 w-3" />USDA SR28 reference (per 100 g)</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">{res.reference.map((r) => (
            <li key={r.ndb} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              <div className="min-w-0 flex-1"><p className="truncate">{r.name}</p><p className="text-xs tabular text-faint">{r.kcal} kcal · P {r.protein} · C {r.carbs} · F {r.fat}</p></div>
              <Button size="sm" variant="outline" onClick={() => start(async () => {
                if (mode === "link" && linkFoodId) { const x = await linkReferenceAction(linkFoodId, r.ndb); setMsg(x.ok ? "Linked." : x.error); onPick?.({ id: linkFoodId, name: r.name, defaultUnit: "g" }); return; }
                const name = r.name.split(",").slice(0, 2).join(",").trim();
                const x = await createFromReferenceAction(r.ndb, name);
                if (x.ok) onPick?.({ id: x.data!.id, name, defaultUnit: "g" }); else setMsg(x.error);
              })}>{mode === "link" ? "Link" : "Use"}</Button>
            </li>
          ))}</ul>
        </div>
      ) : q.length > 1 && !pending ? <p className="text-sm text-faint">No matches.</p> : null}
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </div>
  );
}
