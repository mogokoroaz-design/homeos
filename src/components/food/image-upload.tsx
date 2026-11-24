"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { buttonClass } from "../ui";

export function ImageUpload({ endpoint, label = "Add photo" }: { endpoint: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{label}</button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true); setError(null);
        const fd = new FormData(); fd.append("file", f);
        const res = await fetch(endpoint, { method: "POST", body: fd });
        setBusy(false);
        if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Upload failed"); else router.refresh();
        e.target.value = "";
      }} />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
