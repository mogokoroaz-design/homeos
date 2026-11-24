"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, FileText, Image as ImageIcon, Video, Loader2 } from "lucide-react";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Textarea, Select, Button, Card } from "../ui";
import { importUrlAction, importTextAction } from "@/app/(app)/food/actions";
import { cn } from "@/lib/utils";

export function ImportForms() {
  const [tab, setTab] = useState<"url" | "text" | "shot" | "video">("url");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const upload = async (fd: FormData) => {
    setBusy(true); setError(null);
    const res = await fetch("/api/recipes/import", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error); else router.push(`/food/import/${data.importId}`);
  };
  const tabs = [["url", "Link", Link2], ["text", "Text / transcript", FileText], ["shot", "Screenshots", ImageIcon], ["video", "Video", Video]] as const;
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-1">
        {tabs.map(([k, label, Icon]) => <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", tab === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}><Icon className="h-4 w-4" />{label}</button>)}
      </div>
      {tab === "url" && (
        <ActionForm action={importUrlAction} className="space-y-3">
          <Field label="Recipe link" hint="Public recipe websites work best (structured recipe data). Instagram/YouTube: HomeOS reads the public caption/description when the platform allows it."><Input name="url" type="url" required placeholder="https://…" /></Field>
          <div className="flex justify-end"><SubmitButton pendingText="Fetching…">Extract</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "text" && (
        <ActionForm action={importTextAction} className="space-y-3">
          <Field label="Paste recipe text, a caption or a transcript"><Textarea name="text" required className="min-h-48" placeholder={"Garlic butter chicken\nServes 4\nIngredients\n500 g chicken thighs\n…\nMethod\n1. …"} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind"><Select name="method" defaultValue="TEXT"><option value="TEXT">Recipe text / caption</option><option value="TRANSCRIPT">Video transcript</option></Select></Field>
            <Field label="Original link (optional)"><Input name="sourceUrl" type="url" /></Field>
          </div>
          <div className="flex justify-end"><SubmitButton>Extract</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "shot" && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("method", "SCREENSHOT"); void upload(fd); }}>
          <Field label="Screenshots of the recipe (up to 8)" hint="Text is read on this Mac with Tesseract OCR. Clear, cropped screenshots give the best results."><input name="files" type="file" accept="image/*" multiple required className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-ink" /></Field>
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Reading…</> : "Extract"}</Button></div>
        </form>
      )}
      {tab === "video" && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("method", "VIDEO"); void upload(fd); }}>
          <Field label="Video file" hint="Stored with the import for reference. HomeOS does not transcribe audio locally — paste the transcript or caption below."><input name="file" type="file" accept="video/*" required className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-ink" /></Field>
          <Field label="Transcript / caption"><Textarea name="transcript" className="min-h-32" /></Field>
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Upload &amp; extract</Button></div>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}
