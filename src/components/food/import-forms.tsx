"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, FileText, Image as ImageIcon, Video, Loader2 } from "lucide-react";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Textarea, Select, Button, Card } from "../ui";
import { importUrlAction, importTextAction } from "@/app/(app)/food/actions";
import { cn } from "@/lib/utils";

/** `shared` = text or link sent from the iPhone/iPad share sheet; it is imported automatically. */
export function ImportForms({ shared }: { shared?: string }) {
  const sharedUrl = shared?.match(/https?:\/\/\S+/)?.[0] ?? null;
  const sharedIsLink = Boolean(sharedUrl && shared!.trim().length - sharedUrl.length < 30);
  const [tab, setTab] = useState<"url" | "text" | "shot" | "video">(shared && !sharedIsLink ? "text" : "url");
  const autoForm = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (shared && !started.current) { started.current = true; autoForm.current?.requestSubmit(); }
  }, [shared]);
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
      {shared ? <p className="mb-3 rounded-lg border border-[#38503f] bg-accent-dim px-3 py-2 text-sm text-accent">Importing what you shared… you&apos;ll see the recipe to review in a moment.</p> : null}
      {tab === "url" && (
        <ActionForm action={importUrlAction} className="space-y-3" formRef={sharedIsLink ? autoForm : undefined}>
          <Field label="Recipe link" hint="Public recipe websites work best (structured recipe data). Instagram/YouTube: HomeOS reads the public caption/description when the platform allows it."><Input name="url" type="url" required placeholder="https://…" defaultValue={sharedIsLink ? sharedUrl ?? "" : ""} /></Field>
          <div className="flex justify-end"><SubmitButton pendingText="Fetching…">Extract</SubmitButton></div>
        </ActionForm>
      )}
      {tab === "text" && (
        <ActionForm action={importTextAction} className="space-y-3" formRef={shared && !sharedIsLink ? autoForm : undefined}>
          {shared && !sharedIsLink && sharedUrl ? <input type="hidden" name="sourceUrl" value={sharedUrl} /> : null}
          <Field label="Paste recipe text, a caption or a transcript"><Textarea name="text" required defaultValue={shared && !sharedIsLink ? shared : ""} className="min-h-48" placeholder={"Garlic butter chicken\nServes 4\nIngredients\n500 g chicken thighs\n…\nMethod\n1. …"} /></Field>
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

/** One-time setup of the "Save to HomeOS" share-sheet Shortcut on iPhone/iPad. */
export function ShareSheetGuide() {
  const [origin, setOrigin] = useState("http://<your-mac>.local:3000");
  useEffect(() => { if (!/localhost|127\.0\.0\.1/.test(window.location.host)) setOrigin(window.location.origin); }, []);
  const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[12.5px] text-ink">{children}</code>;
  return (
    <details className="mt-5 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-muted">
      <summary className="cursor-pointer font-medium text-ink">Save recipes straight from Instagram, TikTok, YouTube or Safari (share sheet)</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>On your iPhone or iPad open <b className="text-ink">Shortcuts</b> → <b className="text-ink">+</b> → name it <C>Save to HomeOS</C>.</li>
        <li>Tap the <b className="text-ink">ⓘ</b> (Details) → turn on <b className="text-ink">Show in Share Sheet</b>. Under the input at the top, choose <C>URLs</C> and <C>Text</C>, and set “If there&apos;s no input” to <C>Ask For Text</C>.</li>
        <li>Add the action <b className="text-ink">URL Encode</b> → it encodes <C>Shortcut Input</C>.</li>
        <li>Add <b className="text-ink">Text</b> and type <C>{origin}/food/import?share=</C> then insert the <C>URL Encoded Text</C> variable at the end (no spaces).{origin.includes("<your-mac>") ? <> Use your Mac&apos;s name from System Settings → General → Sharing → Local hostname.</> : null}</li>
        <li>Add <b className="text-ink">Open URLs</b> (it opens the Text from step 4).</li>
        <li>Now in Instagram/TikTok/YouTube/Safari tap <b className="text-ink">Share</b> → <b className="text-ink">Save to HomeOS</b>. HomeOS opens, asks you to unlock if needed, imports the recipe and shows it for review. If a platform hides the caption, select the caption text, tap Share → Save to HomeOS to send the text instead.</li>
      </ol>
      <p className="mt-3 text-xs">Works whenever your device is on the same Wi-Fi as the Mac running HomeOS. Nothing is sent anywhere else.</p>
    </details>
  );
}
