"use client";
import { Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Input, Select, Field } from "../ui";
import { FIELD_TYPES, FIELD_TYPE_LABELS, keyFromLabel, type FieldDef } from "@/lib/projects/schema";

export function FieldEditor({ field, onChange, onRemove, onMove, lockKey, otherKeys }: { field: FieldDef; onChange: (f: FieldDef) => void; onRemove?: () => void; onMove?: (d: -1 | 1) => void; lockKey?: boolean; otherKeys: string[] }) {
  const c = field.config;
  const set = (patch: Partial<FieldDef>) => onChange({ ...field, ...patch });
  const setC = (patch: Partial<FieldDef["config"]>) => onChange({ ...field, config: { ...c, ...patch } });
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v))));
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
      <div className="grid grid-cols-[1fr_170px_auto] items-end gap-2">
        <Field label="Label"><Input value={field.label} onChange={(e) => set({ label: e.target.value, ...(lockKey ? {} : { key: keyFromLabel(e.target.value) || field.key }) })} className="h-10" /></Field>
        <Field label="Type"><Select value={field.type} onChange={(e) => set({ type: e.target.value as FieldDef["type"], config: {} })} className="h-10">{FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}</Select></Field>
        <div className="flex items-center gap-0.5 pb-1">
          <label className="mr-1 flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={field.required} onChange={(e) => set({ required: e.target.checked })} className="accent-[#9cc2b0]" />required</label>
          {onMove ? <><button type="button" onClick={() => onMove(-1)} className="p-1.5 text-faint hover:text-ink" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => onMove(1)} className="p-1.5 text-faint hover:text-ink" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button></> : null}
          {onRemove ? <button type="button" onClick={onRemove} className="p-1.5 text-faint hover:text-danger" aria-label="Remove field"><Trash2 className="h-4 w-4" /></button> : null}
        </div>
      </div>
      {["NUMBER", "RATING", "DURATION"].includes(field.type) ? (
        <div className="grid grid-cols-3 gap-2">
          <Input className="h-9" placeholder={field.type === "RATING" ? "min (1)" : "min"} inputMode="decimal" value={c.min ?? ""} onChange={(e) => onChange({ ...field, config: clean({ ...c, min: e.target.value === "" ? undefined : Number(e.target.value) }) })} />
          <Input className="h-9" placeholder={field.type === "RATING" ? "max (5)" : "max"} inputMode="decimal" value={c.max ?? ""} onChange={(e) => onChange({ ...field, config: clean({ ...c, max: e.target.value === "" ? undefined : Number(e.target.value) }) })} />
          {field.type === "NUMBER" ? <Input className="h-9" placeholder="unit (pages, km…)" value={c.unit ?? ""} onChange={(e) => onChange({ ...field, config: clean({ ...c, unit: e.target.value || undefined }) })} /> : <div />}
        </div>
      ) : null}
      {["SINGLE_SELECT", "MULTI_SELECT"].includes(field.type) ? <Input className="h-9" placeholder="Options, comma separated" value={(c.options ?? []).join(", ")} onChange={(e) => setC({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /> : null}
      {field.type === "CHECKLIST" ? <Input className="h-9" placeholder="Default checklist items, comma separated" value={(c.items ?? []).join(", ")} onChange={(e) => setC({ items: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /> : null}
      {field.type === "FORMULA" ? <div><Input className="h-9 font-mono text-sm" placeholder="e.g. round(pages_read / minutes * 60, 1)" value={c.expression ?? ""} onChange={(e) => setC({ expression: e.target.value })} /><p className="mt-1 text-[11px] text-faint">Use number fields: {otherKeys.join(", ") || "—"}. Supports + − × ÷ ( ) min max round abs. Evaluated safely; never runs code.</p></div> : null}
      <p className="text-[11px] text-faint">key: {field.key}</p>
    </div>
  );
}
