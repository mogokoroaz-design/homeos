"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ImagePlus, Star } from "lucide-react";
import { Button, Input, Textarea, Select, Field } from "../ui";
import { saveEntryAction } from "@/app/(app)/projects/actions";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface FieldDTO { id: string; key: string; label: string; type: string; required: boolean; config: { min?: number; max?: number; unit?: string; options?: string[]; items?: string[]; expression?: string } }

export function EntryForm({ projectId, fields, entry, onDone }: { projectId: string; fields: FieldDTO[]; entry?: { id: string; date: string; values: Record<string, unknown> }; onDone?: () => void }) {
  const init = () => Object.fromEntries(fields.map((f) => [f.key, entry?.values[f.key] ?? (f.type === "CHECKLIST" ? (f.config.items ?? []).map((t) => ({ text: t, done: false })) : f.type === "MULTI_SELECT" || f.type === "TAGS" ? [] : f.type === "BOOLEAN" ? false : "")]));
  const [values, setValues] = useState<Record<string, unknown>>(init);
  const [date, setDate] = useState(entry?.date ?? today());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: string, v: unknown) => { setValues((x) => ({ ...x, [k]: v })); setSaved(false); };
  const submit = () => start(async () => {
    setError(null);
    const r = await saveEntryAction(projectId, date, JSON.stringify(values), entry?.id);
    if (!r.ok) { setError(r.error); return; }
    setSaved(true);
    if (!entry) setValues(init());
    router.refresh();
    onDone?.();
  });
  return (
    <div className="space-y-4">
      <Field label="Date" className="max-w-48"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {fields.filter((f) => f.type !== "FORMULA").map((f) => (
        <Field key={f.id} group={["RATING", "MULTI_SELECT", "CHECKLIST", "IMAGE", "BOOLEAN"].includes(f.type)} label={`${f.label}${f.required ? " *" : ""}${f.config.unit ? ` (${f.config.unit})` : ""}`}>
          <FieldInput f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
        </Field>
      ))}
      {fields.some((f) => f.type === "FORMULA") ? <p className="text-xs text-faint">Formula fields ({fields.filter((f) => f.type === "FORMULA").map((f) => f.label).join(", ")}) are calculated when you save.</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">{saved ? <span className="text-sm text-accent">Saved</span> : null}<Button variant="primary" onClick={submit} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{entry ? "Update entry" : "Save entry"}</Button></div>
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: FieldDTO; value: unknown; onChange: (v: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  switch (f.type) {
    case "LONG_TEXT": return <Textarea value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "NUMBER": return <Input inputMode="decimal" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "DURATION": return <Input inputMode="numeric" placeholder="minutes" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "RATING": {
      const min = f.config.min ?? 1, max = f.config.max ?? 5;
      return <div className="flex flex-wrap gap-1.5">{Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => <button type="button" key={n} onClick={() => onChange(value === n ? "" : n)} className={cn("flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm", Number(value) >= n ? "border-accent bg-accent-dim text-accent" : "border-line-strong text-muted")} aria-label={`${n}`}>{max <= 5 ? <Star className={cn("h-4 w-4", Number(value) >= n && "fill-current")} /> : n}</button>)}</div>;
    }
    case "BOOLEAN": return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[#9cc2b0]" />Yes</label>;
    case "SINGLE_SELECT": return <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{(f.config.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>;
    case "MULTI_SELECT": {
      const arr = (value as string[]) ?? [];
      return <div className="flex flex-wrap gap-1.5">{(f.config.options ?? []).map((o) => <button type="button" key={o} onClick={() => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} className={cn("rounded-lg border px-3 py-1.5 text-sm", arr.includes(o) ? "border-accent bg-accent-dim text-accent" : "border-line-strong text-muted")}>{o}</button>)}</div>;
    }
    case "TAGS": return <Input value={Array.isArray(value) ? (value as string[]).join(", ") : String(value ?? "")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="comma separated" />;
    case "DATE": return <Input type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "TIME": return <Input type="time" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "CHECKLIST": {
      const items = (value as { text: string; done: boolean }[]) ?? [];
      return (
        <div className="space-y-1.5">
          {items.map((it, i) => <div key={i} className="flex items-center gap-2"><input type="checkbox" checked={it.done} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} className="h-5 w-5 accent-[#9cc2b0]" /><Input className="h-9" value={it.text} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /></div>)}
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...items, { text: "", done: false }])}>Add item</Button>
        </div>
      );
    }
    case "IMAGE":
      return (
        <div className="flex items-center gap-3">
          {value ? <img src={`/api/files/${value}`} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" /> : null}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-sm text-muted hover:text-ink">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{value ? "Replace" : "Add image"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); const fd = new FormData(); fd.append("file", file); const r = await fetch("/api/uploads", { method: "POST", body: fd }); setUploading(false); if (r.ok) onChange((await r.json()).id); }} />
          </label>
        </div>
      );
    default: return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}
