"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Plus, Lock, Wand2 } from "lucide-react";
import { Button, Textarea, Input, Card, Field, Badge, Checkbox } from "../ui";
import { VoiceButton } from "../assistant/voice";
import { FieldEditor } from "./field-editor";
import { proposeProjectAction, createProjectAction, refineProjectAction } from "@/app/(app)/projects/actions";
import type { ProjectDef, FieldDef } from "@/lib/projects/schema";

const EXAMPLES = [
  "I want to create a daily journal where I can record my mood, what happened during the day, what I learned, what I am grateful for and how I felt.",
  "A meditation tracker", "A reading tracker for books, pages read and thoughts", "An emotional regulation journal",
];

export function ProjectBuilder() {
  const [text, setText] = useState("");
  const [def, setDef] = useState<ProjectDef | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [engine, setEngine] = useState("");
  const [refine, setRefine] = useState("");
  const [refineResult, setRefineResult] = useState<{ changes: string[]; notUnderstood: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const propose = (t: string) => start(async () => {
    setError(null);
    const r = await proposeProjectAction(t);
    if (!r.ok) { setError(r.error); return; }
    setDef(r.data!.proposal); setNotes(r.data!.notes); setEngine(r.data!.engine); setRefineResult(null);
  });
  const applyRefine = () => start(async () => {
    if (!def || !refine.trim()) return;
    setError(null);
    const r = await refineProjectAction(JSON.stringify(def), refine);
    if (!r.ok) { setError(r.error); return; }
    setDef(r.data!.proposal);
    setRefineResult({ changes: r.data!.changes, notUnderstood: r.data!.notUnderstood });
    if (r.data!.changes.length) setRefine("");
  });
  // Creating shows its own status and any error right next to the button.
  const create = async () => {
    if (!def) return;
    setCreateError(null);
    setCreating(true);
    try {
      const r = await createProjectAction(JSON.stringify(def));
      if (!r.ok) { setCreateError(r.error); return; }
      router.push(`/projects/${r.data!.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? `Couldn't reach HomeOS: ${e.message}. Is it still running in Terminal?` : "Couldn't create the project.");
    } finally {
      setCreating(false);
    }
  };

  const setField = (i: number, f: FieldDef) => def && setDef({ ...def, fields: def.fields.map((x, j) => (j === i ? f : x)) });
  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <p className="font-medium">Describe what you want to track</p>
        <div className="flex gap-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24" placeholder="e.g. I want a daily journal where I record my mood, what happened, what I learned…" /><VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} /></div>
        <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => { setText(e); propose(e); }} className="rounded-full border border-line-strong px-3 py-1 text-left text-xs text-muted hover:text-ink">{e.length > 60 ? e.slice(0, 60) + "…" : e}</button>)}</div>
        <div className="flex justify-end"><Button variant="primary" onClick={() => propose(text)} disabled={pending || text.trim().length < 5}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Propose structure</Button></div>
      </Card>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {def ? (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Proposed project</p><Badge><Lock className="h-3 w-3" />private</Badge><Badge tone="info">{engine === "rules" ? "rule-based" : engine}</Badge><Button variant="primary" size="sm" className="ml-auto" onClick={() => void create()} disabled={creating || pending}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{creating ? "Creating…" : "Approve & create"}</Button></div>
          {notes.length ? <ul className="space-y-1 text-sm text-muted">{notes.map((n) => <li key={n}>• {n}</li>)}</ul> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} /></Field>
            <Field label="Description"><Input value={def.description} onChange={(e) => setDef({ ...def, description: e.target.value })} /></Field>
          </div>
          <div className="space-y-2 rounded-xl border border-line-strong bg-surface-2 p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Wand2 className="h-4 w-4 text-accent" />Refine in your own words</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); applyRefine(); }}>
              <Input value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="e.g. add a photo and minutes walked; remove notes; make energy 1-10" aria-label="Refine instruction" />
              <VoiceButton onText={(t) => setRefine((x) => (x ? `${x}; ${t}` : t))} />
              <Button type="submit" variant="secondary" disabled={pending || !refine.trim()}>Apply</Button>
            </form>
            <p className="text-xs text-faint">Understands: add …, remove …, rename X to Y, make X a rating / yes-no / number / photo / choice of a, b, c, make X 1-10, make X required, reminder at 8pm, no reminder, call it …</p>
            {refineResult?.changes.length ? <ul className="space-y-0.5 text-sm text-accent">{refineResult.changes.map((c) => <li key={c}>✓ {c}</li>)}</ul> : null}
            {refineResult?.notUnderstood.length ? <p className="text-sm text-warn">Didn&apos;t understand: “{refineResult.notUnderstood.join("”, “")}”. Try the phrasings above{engine === "rules" ? ", or turn on local AI in Settings for free-form requests" : ""}.</p> : null}
          </div>
          <div className="space-y-2">
            {def.fields.map((f, i) => (
              <FieldEditor key={i} field={f} onChange={(nf) => setField(i, nf)} onRemove={() => setDef({ ...def, fields: def.fields.filter((_, j) => j !== i) })}
                onMove={(d) => { const a = [...def.fields]; const t = a[i + d]; if (!t) return; a[i + d] = a[i]; a[i] = t; setDef({ ...def, fields: a }); }}
                otherKeys={def.fields.filter((x, j) => j !== i && ["NUMBER", "RATING", "DURATION", "BOOLEAN"].includes(x.type)).map((x) => x.key)} />
            ))}
            <Button size="sm" onClick={() => setDef({ ...def, fields: [...def.fields, { key: `field_${def.fields.length + 1}`, label: `Field ${def.fields.length + 1}`, type: "SHORT_TEXT", required: false, config: {} }] })}><Plus className="h-4 w-4" />Add field</Button>
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <Checkbox label={def.reminder ? `Private reminder at ${def.reminder.time}` : "Add a daily private reminder at 21:00"} checked={Boolean(def.reminder)} onChange={(e) => setDef({ ...def, reminder: e.target.checked ? { time: "21:00", weekdays: "0,1,2,3,4,5,6", message: `Time for ${def.name}` } : null })} />
            {def.integrations.map((ig, i) => <Checkbox key={i} label={`Propose sharing “${ig.label}” (${ig.metric.replace("_", " ")}) with household Insights — needs separate approval after creation`} checked onChange={() => setDef({ ...def, integrations: def.integrations.filter((_, j) => j !== i) })} />)}
          </div>
          {createError ? <p role="alert" ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="rounded-lg border border-[#55302d] bg-danger-dim px-3 py-2 text-sm text-danger">Couldn&apos;t create the project: {createError}</p> : null}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDef(null)}>Start over</Button><Button variant="primary" onClick={() => void create()} disabled={creating || pending}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{creating ? "Creating…" : "Approve & create"}</Button></div>
        </Card>
      ) : null}
    </div>
  );
}
