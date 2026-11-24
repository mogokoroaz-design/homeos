"use client";
import { useState, useTransition } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogButton } from "../dialog";
import { Button } from "../ui";
import { FieldEditor } from "./field-editor";
import { EntryForm, type FieldDTO } from "./entry-form";
import { upsertFieldAction } from "@/app/(app)/projects/actions";
import type { FieldDef } from "@/lib/projects/schema";

export function FieldDialog({ projectId, field, otherKeys }: { projectId: string; field?: FieldDTO; otherKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<FieldDef>(field ? { key: field.key, label: field.label, type: field.type as FieldDef["type"], required: field.required, config: field.config } : { key: "new_field", label: "New field", type: "SHORT_TEXT", required: false, config: {} });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size={field ? "iconSm" : "sm"} variant={field ? "ghost" : "secondary"} onClick={() => setOpen(true)} aria-label={field ? "Edit field" : "Add field"}>{field ? <Pencil className="h-3.5 w-3.5" /> : <><Plus className="h-4 w-4" />Add field</>}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={field ? `Edit “${field.label}”` : "Add field"} wide>
        <FieldEditor field={f} onChange={setF} lockKey={Boolean(field)} otherKeys={otherKeys} />
        {field ? <p className="mt-2 text-xs text-faint">Changing a field keeps existing entries; values that no longer fit the new type are shown as-is.</p> : null}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end"><Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await upsertFieldAction(projectId, JSON.stringify(f), field?.id); if (r.ok) setOpen(false); else setError(r.error); })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save field</Button></div>
      </Dialog>
    </>
  );
}

export function EditEntryDialog({ projectId, fields, entry }: { projectId: string; fields: FieldDTO[]; entry: { id: string; date: string; values: Record<string, unknown> } }) {
  return <DialogButton label={<Pencil className="h-3.5 w-3.5" />} title="Edit entry" variant="ghost" size="iconSm" wide>{(close) => <EntryForm projectId={projectId} fields={fields} entry={entry} onDone={close} />}</DialogButton>;
}
