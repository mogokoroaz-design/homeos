"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, FolderPlus, Check } from "lucide-react";
import { Dialog } from "../dialog";
import { Button, Input, Badge, buttonClass } from "../ui";
import { VoiceButton } from "../assistant/voice";
import { adaptRecipeAction, saveRecipeAction, createCollectionAction, toggleCollectionAction } from "@/app/(app)/food/actions";
import { cn } from "@/lib/utils";

const PRESETS = ["Gluten-free", "Dairy-free", "Vegan", "Vegetarian", "Egg-free", "Nut-free", "Less sugar"];
type Draft = NonNullable<Extract<Awaited<ReturnType<typeof adaptRecipeAction>>, { ok: true }>["data"]>;

/** Adapt a recipe into a new variant (the original is kept). */
export function AdaptDialog({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const preview = (instruction: string) => start(async () => {
    setError(null);
    const r = await adaptRecipeAction(recipeId, instruction);
    if (!r.ok) { setError(r.error); setResult(null); return; }
    setResult(r.data!);
  });
  const save = () => start(async () => {
    if (!result) return;
    const r = await saveRecipeAction(JSON.stringify(result.draft));
    if (!r.ok) { setError(r.error); return; }
    setOpen(false);
    router.push(`/food/recipes/${r.data!.id}`);
  });
  const edit = () => {
    if (!result) return;
    try { sessionStorage.setItem("homeos.recipeDraft", JSON.stringify(result.draft)); } catch { /* ignore */ }
    router.push("/food/recipes/new?draft=1");
  };
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}><Wand2 className="h-4 w-4" />Adapt</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Adapt this recipe" wide>
        <div className="space-y-4">
          <p className="text-sm text-muted">Creates a new version — the original stays as it is.</p>
          <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p} type="button" onClick={() => { setText(`make it ${p.toLowerCase()}`); preview(`make it ${p.toLowerCase()}`); }} className="rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">{p}</button>)}</div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) preview(text); }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. swap butter for olive oil; without mushrooms; double the garlic" aria-label="Adaptation" />
            <VoiceButton onText={(t) => setText(t)} />
            <Button type="submit" variant="secondary" disabled={pending || !text.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Preview</Button>
          </form>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {result ? (
            <div className="space-y-3 rounded-xl border border-line-strong bg-surface-2 p-4">
              <p className="font-medium">{result.draft.name} {result.engine !== "rules" ? <Badge tone="info">local AI</Badge> : null}</p>
              {result.changes.length ? <ul className="space-y-1 text-sm">{result.changes.map((c) => <li key={c} className="text-accent">✓ {c}</li>)}</ul> : <p className="text-sm text-muted">Nothing in this recipe needed changing for that.</p>}
              {result.unresolved.length ? <p className="text-sm text-warn">Couldn&apos;t apply: {result.unresolved.join(", ")}. Try “swap X for Y”, “without X”, “double X”{result.engine === "rules" ? ", or turn on local AI in Settings for free-form changes" : ""}.</p> : null}
              {result.tips.map((t) => <p key={t} className="text-xs text-faint">Tip: {t}</p>)}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={edit} disabled={!result.changes.length}>Edit before saving</Button>
                <Button variant="primary" onClick={save} disabled={pending || !result.changes.length}>Save as new recipe</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/** Add/remove the recipe from collections, or create one. */
export function CollectionsDialog({ recipeId, collections }: { recipeId: string; collections: { id: string; name: string; has: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(collections);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const count = state.filter((c) => c.has).length;
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => { setState(collections); setOpen(true); }}><FolderPlus className="h-4 w-4" />{count ? `In ${count} collection${count > 1 ? "s" : ""}` : "Collections"}</button>
      <Dialog open={open} onClose={() => { setOpen(false); router.refresh(); }} title="Collections">
        <div className="space-y-2">
          {state.map((c) => (
            <button key={c.id} type="button" disabled={pending} onClick={() => start(async () => { const r = await toggleCollectionAction(c.id, recipeId); if (r.ok) setState((s) => s.map((x) => (x.id === c.id ? { ...x, has: !x.has } : x))); })} className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left", c.has ? "border-accent/50 bg-accent-dim" : "border-line-strong hover:bg-surface-2")}>
              <span>{c.name}</span>{c.has ? <Check className="h-4 w-4 text-accent" /> : null}
            </button>
          ))}
          {!state.length ? <p className="text-sm text-muted">No collections yet — e.g. “Weeknight”, “Desserts”, “Meal prep”.</p> : null}
          <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; start(async () => { const r = await createCollectionAction(name, recipeId); if (r.ok) { setState((s) => [...s.filter((x) => x.id !== r.data!.id), { id: r.data!.id, name: name.trim(), has: true }]); setName(""); } }); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection" aria-label="New collection name" />
            <Button type="submit" disabled={pending || !name.trim()}>Create</Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
