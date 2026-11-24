"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, Search, StickyNote } from "lucide-react";
import { fetchNotes, type NoteDTO } from "@/app/(app)/actions";
import { NoteEditor } from "../notes/note-editor";
import { NoteCard } from "../notes/note-card";
import { Input, buttonClass } from "../ui";

function contextFromPath(path: string) {
  const m = path.match(/^\/food\/recipes\/([0-9a-f-]{36})/);
  if (m) return { type: "recipe", id: m[1], label: "this recipe" };
  const p = path.match(/^\/projects\/([0-9a-f-]{36})/);
  if (p) return { type: "project", id: p[1], label: "this project" };
  const pr = path.match(/^\/money\/prices/);
  if (pr && typeof window !== "undefined") {
    const id = new URLSearchParams(window.location.search).get("product");
    if (id) return { type: "product", id, label: "this product" };
  }
  return null;
}

export function NotesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [editing, setEditing] = useState<NoteDTO | null>(null);
  const [onlyHere, setOnlyHere] = useState(false);
  const ctx = contextFromPath(path);
  const load = useCallback(async () => setNotes(await fetchNotes(q, onlyHere && ctx ? { type: ctx.type, id: ctx.id } : undefined)), [q, onlyHere, ctx?.id, ctx?.type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="fade-in flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Notes">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold"><StickyNote className="h-4 w-4 text-accent" />Notes</h2>
          <div className="flex items-center gap-1">
            <Link href="/notes" onClick={onClose} className={buttonClass("ghost", "sm")}>Open all</Link>
            <button type="button" onClick={onClose} className={buttonClass("ghost", "iconSm")} aria-label="Close notes"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {editing ? (
            <NoteEditor key={editing.id} note={editing} onDone={() => { setEditing(null); void load(); }} compact />
          ) : (
            <NoteEditor key="new" link={ctx} onDone={() => void load()} compact />
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="h-10 pl-9" />
          </div>
          {ctx ? <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} className="accent-[#9cc2b0]" />Only notes linked to {ctx.label}</label> : null}
          <div className="space-y-2.5">
            {notes.length ? notes.map((n) => <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onChanged={() => void load()} />) : <p className="py-6 text-center text-sm text-faint">No notes yet.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
