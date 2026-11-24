"use client";
import { useTransition } from "react";
import Link from "next/link";
import { Pin, Trash2, Pencil, Lock, Users, Link2 } from "lucide-react";
import { toggleNoteItem, toggleNotePin, deleteNoteAction, unlinkNoteAction, type NoteDTO } from "@/app/(app)/actions";
import { Badge } from "../ui";
import { cn } from "@/lib/utils";

const HREF: Record<string, (id: string) => string> = { recipe: (id) => `/food/recipes/${id}`, project: (id) => `/projects/${id}`, provider: () => `/home/services`, task: () => `/home`, bill: () => `/money/bills`, product: (id) => `/money/prices?product=${id}` };

export function NoteCard({ note, onEdit, onChanged }: { note: NoteDTO; onEdit?: () => void; onChanged?: () => void }) {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<void>) => start(async () => { await fn(); onChanged?.(); });
  return (
    <div className={cn("rounded-xl border border-line bg-surface-2 p-3.5 transition-opacity", pending && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {note.title ? <p className="font-medium leading-snug">{note.title}</p> : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-faint">
            {note.visibility === "PRIVATE" ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Private</span> : <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Shared · {note.owner}</span>}
            <span>· {new Date(note.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <button type="button" onClick={() => act(() => toggleNotePin(note.id))} className={cn("p-1", note.pinned ? "text-accent" : "text-faint hover:text-ink")} aria-label={note.pinned ? "Unpin" : "Pin"}><Pin className="h-4 w-4" /></button>
        {onEdit ? <button type="button" onClick={onEdit} className="p-1 text-faint hover:text-ink" aria-label="Edit"><Pencil className="h-4 w-4" /></button> : null}
        {note.mine || note.visibility === "SHARED" ? <button type="button" onClick={() => { if (confirm("Delete this note?")) act(() => deleteNoteAction(note.id)); }} className="p-1 text-faint hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button> : null}
      </div>
      {note.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink/90">{note.body}</p> : null}
      {note.checklist.length ? (
        <ul className="mt-2 space-y-1">
          {note.checklist.map((c, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={c.done} onChange={() => act(() => toggleNoteItem(note.id, i))} className="h-4 w-4 accent-[#9cc2b0]" />
                <span className={c.done ? "text-faint line-through" : ""}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {note.attachments.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {note.attachments.map((a) => (a.mime.startsWith("image/") ? <a key={a.id} href={`/api/files/${a.id}`} target="_blank"><img src={`/api/files/${a.id}`} alt={a.name} className="h-16 w-16 rounded-lg border border-line object-cover" /></a> : <a key={a.id} href={`/api/files/${a.id}`} className="text-xs text-info underline">{a.name}</a>))}
        </div>
      ) : null}
      {note.tags || note.links.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {note.tags.split(",").filter(Boolean).map((t) => <Badge key={t}>#{t}</Badge>)}
          {note.links.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1">
              <Link href={HREF[l.entityType]?.(l.entityId) ?? "#"}><Badge tone="info"><Link2 className="h-3 w-3" />{l.label || l.entityType}</Badge></Link>
              <button type="button" className="text-[11px] text-faint hover:text-ink" onClick={() => act(() => unlinkNoteAction(l.id))} aria-label="Unlink">×</button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
