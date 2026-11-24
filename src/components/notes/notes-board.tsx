"use client";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { fetchNotes, type NoteDTO } from "@/app/(app)/actions";
import { NoteEditor } from "./note-editor";
import { NoteCard } from "./note-card";
import { Input, Card } from "../ui";
import { cn } from "@/lib/utils";

export function NotesBoard() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteDTO[]>([]);
  const [editing, setEditing] = useState<NoteDTO | null>(null);
  const [scope, setScope] = useState<"all" | "PRIVATE" | "SHARED">("all");
  const load = useCallback(async () => setNotes(await fetchNotes(q)), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  const tags = [...new Set(notes.flatMap((n) => n.tags.split(",").filter(Boolean)))].sort();
  const shown = notes.filter((n) => (!tag || n.tags.split(",").includes(tag)) && (scope === "all" || n.visibility === scope));
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-4"><p className="mb-3 font-medium">{editing ? "Edit note" : "New note"}</p>{editing ? <NoteEditor key={editing.id} note={editing} onDone={() => { setEditing(null); void load(); }} /> : <NoteEditor key="new" onDone={() => void load()} />}</Card>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes and checklists" className="pl-9" /></div>
          {(["all", "PRIVATE", "SHARED"] as const).map((s) => <button key={s} type="button" onClick={() => setScope(s)} className={cn("rounded-lg px-3 py-2 text-sm", scope === s ? "bg-surface-3 text-ink" : "text-muted")}>{s === "all" ? "All" : s === "PRIVATE" ? "Private" : "Shared"}</button>)}
        </div>
        {tags.length ? <div className="flex flex-wrap gap-1.5">{tags.map((t) => <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} className={cn("rounded-md border px-2 py-0.5 text-xs", tag === t ? "border-accent text-accent" : "border-line-strong text-muted")}>#{t}</button>)}</div> : null}
        <div className="columns-1 gap-3 md:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {shown.map((n) => <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onChanged={() => void load()} />)}
        </div>
        {!shown.length ? <p className="py-8 text-center text-sm text-faint">No notes.</p> : null}
      </div>
    </div>
  );
}
