"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X, Loader2 } from "lucide-react";
import { approveAIAction, rejectAIAction } from "@/app/(app)/actions";
import { Button, Badge, Input } from "../ui";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";

type Status = "PROPOSED" | "EXECUTED" | "REJECTED" | "FAILED";

/** Preview → Approve → Execute. Users can adjust the preview before approving. */
export function ActionCard({ actionId, kind, summary, preview, initialStatus = "PROPOSED", onDone }: { actionId: string; kind: string; summary: string; preview: unknown; initialStatus?: Status; onDone?: (status: Status) => void }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [edited, setEdited] = useState<unknown>(() => initialPayload(kind, preview));
  const decide = (approve: boolean) => start(async () => {
    const r = approve ? await approveAIAction(actionId, edited ?? undefined) : await rejectAIAction(actionId);
    if (r.ok) {
      const s: Status = approve ? "EXECUTED" : "REJECTED";
      setStatus(s);
      setMessage(approve ? resultText(r.data) : null);
      onDone?.(s);
    } else setMessage(r.error);
  });
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Needs your approval</p>
          <p className="mt-0.5 text-sm font-medium">{summary}</p>
        </div>
        <Badge tone={status === "EXECUTED" ? "accent" : status === "PROPOSED" ? "warn" : status === "FAILED" ? "danger" : "neutral"}>{status === "PROPOSED" ? "Preview" : status.toLowerCase()}</Badge>
      </div>
      <div className="px-4 py-3 text-sm"><Preview kind={kind} preview={preview} edited={edited} setEdited={status === "PROPOSED" ? setEdited : undefined} /></div>
      {status === "PROPOSED" ? (
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button size="sm" variant="ghost" onClick={() => decide(false)} disabled={pending}><X className="h-4 w-4" />Dismiss</Button>
          <Button size="sm" variant="primary" onClick={() => decide(true)} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve</Button>
        </div>
      ) : null}
      {message ? <p className={`border-t border-line px-4 py-2.5 text-sm ${status === "EXECUTED" ? "text-accent" : "text-danger"}`}>{message}</p> : null}
    </div>
  );
}

function initialPayload(kind: string, preview: unknown): unknown {
  const p = preview as Record<string, unknown>;
  if (kind === "MEAL_PLAN" && p && Array.isArray(p.meals)) return { meals: (p.meals as { date: string; slot: string; recipeId: string }[]).map((m) => ({ date: m.date, slot: m.slot, recipeId: m.recipeId })) };
  if (kind === "MEAL_COOKED") return null; // payload stored server-side; quantities edited below
  return preview;
}

function resultText(data: unknown) {
  if (Array.isArray(data)) return data.map((d) => (typeof d === "string" ? d : (d as { name?: string; consumed?: number; unit?: string; shortfall?: number }).name ? `${(d as { name: string }).name}: −${(d as { consumed: number }).consumed} ${(d as { unit: string }).unit}` : JSON.stringify(d))).join(" · ");
  if (data && typeof data === "object" && "added" in (data as object)) return `Added ${(data as { added: number }).added} meals. Shopping list updated.`;
  if (data && typeof data === "object" && "id" in (data as object)) return "Created.";
  return "Done.";
}

function Preview({ kind, preview, edited, setEdited }: { kind: string; preview: unknown; edited: unknown; setEdited?: (v: unknown) => void }) {
  const p = preview as Record<string, unknown>;
  if (kind === "PANTRY_UPDATE") {
    const changes = (edited as { changes: { action: string; name: string; quantity: number | null; unit: string; location?: string | null }[] }).changes;
    return (
      <ul className="space-y-1.5">
        {changes.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            <Badge tone={c.action === "ADD" ? "accent" : c.action === "WASTE" ? "danger" : "info"}>{c.action.toLowerCase()}</Badge>
            {setEdited ? <Input className="h-8 w-20" inputMode="decimal" value={c.quantity ?? ""} onChange={(e) => setEdited({ changes: changes.map((x, j) => (j === i ? { ...x, quantity: e.target.value === "" ? null : Number(e.target.value) } : x)) })} /> : <span className="tabular">{c.quantity ?? "all"}</span>}
            <span className="text-muted">{c.unit}</span>
            <span className="font-medium">{c.name}</span>
            {c.location ? <span className="text-xs text-faint">→ {c.location.toLowerCase()}</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "GROCERY_ADD") {
    const items = (edited as { items: { name: string; quantity: number; unit: string }[] }).items;
    return <ul className="space-y-1">{items.map((i, k) => <li key={k} className="flex gap-2"><span className="tabular text-muted">{formatQuantity(i.quantity, i.unit)}</span><span>{i.name}</span></li>)}</ul>;
  }
  if (kind === "MEAL_PLAN") {
    const meals = (p.meals ?? []) as { date: string; slot: string; recipeId: string; title: string; coverage: number; estCostCents: number; missing: string[] }[];
    const chosen = new Set(((edited as { meals: { date: string; slot: string }[] }).meals).map((m) => `${m.date}|${m.slot}`));
    return (
      <div>
        <ul className="divide-y divide-line">
          {meals.map((m) => {
            const key = `${m.date}|${m.slot}`;
            return (
              <li key={key} className="flex items-center gap-3 py-2">
                {setEdited ? <input type="checkbox" className="h-4 w-4 accent-[#9cc2b0]" checked={chosen.has(key)} onChange={(e) => setEdited({ meals: meals.filter((x) => (`${x.date}|${x.slot}` === key ? e.target.checked : chosen.has(`${x.date}|${x.slot}`))).map((x) => ({ date: x.date, slot: x.slot, recipeId: x.recipeId })) })} /> : null}
                <span className="w-24 shrink-0 text-muted">{formatDate(m.date, { weekday: true })}</span>
                <span className="min-w-0 flex-1"><span className="font-medium">{m.title}</span><span className="block truncate text-xs text-faint">{m.missing.length ? `Buy: ${m.missing.join(", ")}` : "All in pantry"}</span></span>
                <Badge tone={m.coverage >= 1 ? "accent" : "neutral"}>{Math.round(m.coverage * 100)}%</Badge>
                <span className="w-16 text-right tabular text-muted">{m.estCostCents ? formatCents(m.estCostCents) : "—"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-faint">Estimated extra cost {formatCents(Number(p.totalKnownCostCents ?? 0))} from recorded prices{(p.unpriced as string[] | undefined)?.length ? "; some ingredients have no recorded price" : ""}.</p>
      </div>
    );
  }
  if (kind === "MEAL_COOKED") {
    const d = p as { deductions: { name: string; quantity: number; unit: string }[]; notInPantry: string[] };
    return (
      <div>
        {d.deductions.length ? <ul className="space-y-1">{d.deductions.map((x, i) => <li key={i}>−{formatQuantity(x.quantity, x.unit)} {x.name}</li>)}</ul> : <p className="text-muted">No pantry stock to deduct.</p>}
        {d.notInPantry?.length ? <p className="mt-2 text-xs text-faint">Not in pantry records: {d.notInPantry.join(", ")}</p> : null}
      </div>
    );
  }
  if (kind === "PROJECT_CREATE") {
    const def = p as { name: string; fields: { label: string; type: string }[]; reminder: { time: string } | null; integrations: { label: string }[] };
    return (
      <div className="space-y-2">
        <p className="font-medium">{def.name} <Badge>private</Badge></p>
        <ul className="grid gap-1 sm:grid-cols-2">{def.fields.map((f, i) => <li key={i} className="flex justify-between gap-2 rounded-lg bg-surface-3 px-2.5 py-1.5"><span>{f.label}</span><span className="text-xs text-faint">{f.type.toLowerCase().replace("_", " ")}</span></li>)}</ul>
        {def.reminder ? <p className="text-xs text-muted">Private reminder at {def.reminder.time}</p> : null}
        {def.integrations.length ? <p className="text-xs text-muted">Proposed (needs separate approval): share “{def.integrations.map((i) => i.label).join(", ")}” totals with Insights</p> : null}
        <Link href="/projects/new" className="text-xs text-info underline">Customise in the Project Builder instead</Link>
      </div>
    );
  }
  if (kind === "RECIPE_SAVE") {
    const r = p as { name: string; ingredients: { name: string; quantity: number | null; unit: string }[]; instructions: string };
    return (
      <div className="space-y-2">
        <p className="font-medium">{r.name} <Badge tone="warn">AI-generated · unverified</Badge></p>
        <ul className="text-muted">{r.ingredients.map((i, k) => <li key={k}>{i.quantity ?? ""} {i.unit} {i.name}</li>)}</ul>
        <ol className="list-decimal space-y-1 pl-5">{r.instructions.split("\n").filter(Boolean).map((s, k) => <li key={k}>{s}</li>)}</ol>
      </div>
    );
  }
  if (kind === "NUTRITION_TARGETS") {
    const t = p as { kcal: number; protein: number; carbs: number; fat: number; fibre: number };
    return <p className="tabular">{t.kcal} kcal · protein {t.protein} g · carbs {t.carbs} g · fat {t.fat} g · fibre {t.fibre} g</p>;
  }
  return <pre className="overflow-x-auto text-xs text-muted">{JSON.stringify(preview, null, 2)}</pre>;
}
