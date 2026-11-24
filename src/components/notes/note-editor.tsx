"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "../forms";
import { Input, Textarea, Select, Button, Checkbox } from "../ui";
import { saveNoteAction, type NoteDTO } from "@/app/(app)/actions";
import { Plus, X, ImagePlus } from "lucide-react";

export function NoteEditor({ note, link, onDone, compact }: { note?: NoteDTO | null; link?: { type: string; id: string; label: string } | null; onDone?: () => void; compact?: boolean }) {
  const [items, setItems] = useState<{ text: string; done: boolean }[]>(note?.checklist ?? []);
  const [attachLink, setAttachLink] = useState(Boolean(link));
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  return (
    <ActionForm
      action={saveNoteAction}
      onSuccess={async (r) => {
        const id = (r.ok && (r.data as { id: string } | undefined)?.id) || note?.id;
        if (id && files.length) {
          for (const f of files) {
            const fd = new FormData();
            fd.append("file", f);
            const res = await fetch(`/api/notes/${id}/attachments`, { method: "POST", body: fd });
            if (!res.ok) setUploadError((await res.json().catch(() => ({}))).error ?? "Upload failed");
          }
        }
        setItems([]);
        setFiles([]);
        onDone?.();
      }}
      className="space-y-3"
    >
      {note ? <input type="hidden" name="id" value={note.id} /> : null}
      <input type="hidden" name="checklist" value={JSON.stringify(items)} />
      {attachLink && link ? (<><input type="hidden" name="linkType" value={link.type} /><input type="hidden" name="linkId" value={link.id} /><input type="hidden" name="linkLabel" value={link.label} /></>) : null}
      <Input name="title" placeholder="Title" defaultValue={note?.title} />
      <Textarea name="body" placeholder="Write a note…" defaultValue={note?.body} className={compact ? "min-h-20" : "min-h-32"} />
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="checkbox" checked={it.done} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} className="h-5 w-5 accent-[#9cc2b0]" />
            <Input value={it.text} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="h-9" placeholder="Checklist item" />
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-faint hover:text-ink" aria-label="Remove item"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setItems([...items, { text: "", done: false }])}><Plus className="h-4 w-4" />Checklist item</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input name="tags" placeholder="tags, comma separated" defaultValue={note?.tags.split(",").filter(Boolean).join(", ")} className="h-10" />
        <Select name="visibility" defaultValue={note?.visibility ?? "PRIVATE"} className="h-10" disabled={note ? !note.mine : false}>
          <option value="PRIVATE">Private (only me)</option>
          <option value="SHARED">Shared with household</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink">
          <ImagePlus className="h-4 w-4" />{files.length ? `${files.length} image(s)` : "Attach images"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <Checkbox name="pinned" label="Pin" defaultChecked={note?.pinned} />
        {link ? <Checkbox label={`Link to ${link.label}`} checked={attachLink} onChange={(e) => setAttachLink(e.target.checked)} /> : null}
      </div>
      {uploadError ? <p className="text-sm text-danger">{uploadError}</p> : null}
      <div className="flex justify-end gap-2">
        {onDone && note ? <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button> : null}
        <SubmitButton>{note ? "Save note" : "Add note"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
