"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Upload, Loader2, KeyRound, Copy, Check } from "lucide-react";
import { Button, Input, Field, Badge, buttonClass } from "../ui";
import { InlineAction } from "../forms";
import { createHealthKeyAction, revokeHealthKeyAction } from "@/app/(app)/people/actions";

interface Summary { at?: string; metrics: number; workouts: number; firstDate: string | null; lastDate: string | null; byType: Record<string, number> }
const NAMES: Record<string, string> = { STEPS: "steps", ACTIVE_KCAL: "active energy", RESTING_HR: "resting HR", WATER_ML: "water" };
function describe(k: string, v: number) {
  const s = v === 1 ? "" : "s";
  if (k === "WEIGHT") return `${v} weigh-in${s}`;
  if (k === "SLEEP_HOURS") return `${v} night${s} of sleep`;
  return `${v} day${s} of ${NAMES[k] ?? k}`;
}

export function HealthCard({ lastImport, lastSync, hasKey }: { lastImport: Summary | null; lastSync: string | null; hasKey: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [since, setSince] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "upload" | "process">("idle");
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const upload = (file: File) => {
    setError(null); setResult(null); setPhase("upload"); setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/health/import${since ? `?since=${since}` : ""}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { setProgress(Math.round((e.loaded / e.total) * 100)); if (e.loaded === e.total) setPhase("process"); } };
    xhr.onload = () => {
      setPhase("idle"); setProgress(null);
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 400) setError(data.error ?? "Import failed"); else { setResult(data); router.refresh(); }
    };
    xhr.onerror = () => { setPhase("idle"); setError("Upload failed — is HomeOS still running?"); };
    xhr.send(file);
  };
  const shown = result ?? lastImport;
  const syncUrl = typeof window !== "undefined" ? `${window.location.origin}/api/health/sync` : "/api/health/sync";

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">1 · Import your history</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>On your iPhone open the <b className="text-ink">Health</b> app → tap your profile picture (top right) → <b className="text-ink">Export All Health Data</b> → Export.</li>
          <li>Send the <code>export.zip</code> to this Mac (AirDrop, or Save to Files → iCloud Drive). Large histories can take a few minutes to export.</li>
          <li>Upload it here. Steps, sleep, weight, active energy, resting heart rate, water and workouts (incl. Apple Watch / Fitness) are imported into <b className="text-ink">your private records</b>. Re-importing later updates instead of duplicating.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Only from (optional)"><Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-44" /></Field>
          <button type="button" className={buttonClass("primary", "md")} disabled={phase !== "idle"} onClick={() => ref.current?.click()}>
            {phase !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {phase === "upload" ? `Uploading ${progress ?? 0}%` : phase === "process" ? "Reading Health data…" : "Upload export.zip"}
          </button>
          <input ref={ref} type="file" accept=".zip,.xml,application/zip,text/xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {shown ? (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <p className="font-medium text-accent">{result ? "Imported" : "Last import"}{shown.at ? ` · ${new Date(shown.at).toLocaleString()}` : ""}</p>
            <p className="mt-1 text-muted">{shown.firstDate && shown.lastDate ? `${shown.firstDate} → ${shown.lastDate} · ` : ""}{Object.entries(shown.byType).map(([k, v]) => describe(k, v)).join(" · ")}{shown.workouts ? ` · ${shown.workouts} workout${shown.workouts === 1 ? "" : "s"}` : ""}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">2 · Keep it in sync automatically {lastSync ? <Badge tone="accent">last sync {new Date(lastSync).toLocaleString()}</Badge> : null}</p>
        <p className="text-sm text-muted">A free iPhone Shortcut sends each day&apos;s totals to HomeOS. It needs your personal sync key — it can only add data to <b className="text-ink">your</b> profile. Step-by-step Shortcut setup is coming next.</p>
        {key ? (
          <div className="space-y-2 rounded-xl border border-[#38503f] bg-accent-dim p-3 text-sm">
            <p className="text-accent">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-1.5 text-xs">{key}</code>
              <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(key); setCopied(true); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button></div>
            <p className="text-xs text-muted">Sync address: <code>{syncUrl}</code></p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await createHealthKeyAction(); if (r.ok) setKey(r.data!.key); else setError(r.error); })}><KeyRound className="h-4 w-4" />{hasKey ? "Replace sync key" : "Create sync key"}</Button>
          {hasKey ? <InlineAction action={revokeHealthKeyAction} variant="ghost" size="md" confirm="Revoke the sync key? The Shortcut will stop working until you create a new one.">Revoke</InlineAction> : null}
        </div>
      </div>
    </div>
  );
}

export function HealthIcon() { return <HeartPulse className="h-4 w-4 text-accent" />; }
