"use client";
import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Dialog } from "../dialog";
import { ActionCard } from "../assistant/action-card";
import { Button, Textarea, buttonClass } from "../ui";
import { planWithAssistantAction } from "@/app/(app)/food/actions";

export function PlanAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("Plan seven days of dinners using our existing pantry inventory, keep grocery spending under $120 and avoid repeating chicken more than twice.");
  const [result, setResult] = useState<{ actionId: string; proposal: unknown } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={buttonClass("secondary", "md")} onClick={() => setOpen(true)}><Sparkles className="h-4 w-4 text-accent" />Plan with assistant</button>
      <Dialog open={open} onClose={() => { setOpen(false); setResult(null); }} title="Meal planning assistant" wide>
        <div className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20" />
          <p className="text-xs text-faint">Understands: number of days, meal types, “under $X”, “no X more than N times”, “without X”, “using the pantry”, “next week / tomorrow”. Uses only recipes in your library and recorded prices.</p>
          <div className="flex justify-end"><Button variant="primary" disabled={pending} onClick={() => start(async () => { setError(null); setResult(null); const r = await planWithAssistantAction(text); if (!r.ok) setError(r.error); else { setResult(r.data!); setWarnings((r.data!.proposal as { warnings: string[] }).warnings); } })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Propose plan</Button></div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {result ? <ActionCard actionId={result.actionId} kind="MEAL_PLAN" summary="Apply this plan" preview={result.proposal} /> : null}
          {warnings.length ? <ul className="space-y-1 text-xs text-warn">{warnings.map((w) => <li key={w}>• {w}</li>)}</ul> : null}
        </div>
      </Dialog>
    </>
  );
}
