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

export function HealthCard({ lastImport, lastSync, lastSyncData, hasKey }: { lastImport: Summary | null; lastSync: string | null; lastSyncData: { date: string; type: string; value: number }[]; hasKey: boolean }) {
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
        <p className="text-sm text-muted">A free iPhone Shortcut sends each day&apos;s totals to HomeOS every night. It uses your personal sync key, which can only add data to <b className="text-ink">your</b> profile.</p>
        {lastSyncData.length ? <p className="text-xs text-muted">Last received: {lastSyncData.map((m) => `${SHORT[m.type] ?? m.type} ${m.value}`).join(" · ")} ({lastSyncData[0].date}). Compare with the Health app the first time.</p> : null}
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
        <ShortcutGuide syncUrl={syncUrl} />
      </div>
    </div>
  );
}

const SHORT: Record<string, string> = { STEPS: "steps", ACTIVE_KCAL: "active kcal", WEIGHT: "kg", RESTING_HR: "resting bpm", SLEEP_HOURS: "h sleep", WATER_ML: "ml water" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-muted">{n}</span><div className="min-w-0 flex-1 space-y-1">{children}</div></li>;
}
const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[12.5px] text-ink">{children}</code>;

/** One-time iPhone Shortcut setup. Values are sent as text; HomeOS understands "8,123 steps", "150 lb", "7 hr 20 min". */
export function ShortcutGuide({ syncUrl }: { syncUrl: string }) {
  const block = (label: string, type: string, how: React.ReactNode) => (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="font-medium text-ink">{label}</p>
      <p>Add <b className="text-ink">Find Health Samples</b> → Type <Code>{type}</Code> {how}</p>
    </div>
  );
  return (
    <details className="rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-sm text-muted">
      <summary className="cursor-pointer font-medium text-ink">Set up the iPhone Shortcut (one time, ~5 minutes)</summary>
      <ol className="mt-4 space-y-4">
        <Step n={1}><p>Tap <b className="text-ink">Create sync key</b> above and copy the key (starts with <Code>hos_</Code>). Have this page open on the Mac or iPad while you build.</p></Step>
        <Step n={2}><p>On your iPhone open <b className="text-ink">Shortcuts</b> → <b className="text-ink">+</b> → name it <Code>Send Health to HomeOS</Code>. Allow access to Health when asked.</p></Step>
        <Step n={3}>
          <p>Add these actions (search for them by name). After each block, long-press the result and <b className="text-ink">Rename</b> it as shown — you&apos;ll use the names in step 4.</p>
          <div className="mt-2 space-y-2">
            {block("Steps → rename to “Steps”", "Steps", <>· Add Filter <Code>Start Date is today</Code> · <Code>Group By: Day</Code>. Then add <b className="text-ink">Calculate Statistics</b> → <Code>Sum</Code>.</>)}
            {block("Active energy → “Active”", "Active Energy", <>· <Code>Start Date is today</Code> · <Code>Group By: Day</Code>, then <b className="text-ink">Calculate Statistics</b> → <Code>Sum</Code>.</>)}
            {block("Weight → “Weight”", "Weight", <>· Sort by <Code>Start Date</Code>, <Code>Latest First</Code>, <Code>Limit 1</Code>.</>)}
            {block("Resting heart rate → “RHR”", "Resting Heart Rate", <>· Sort <Code>Latest First</Code>, <Code>Limit 1</Code>.</>)}
            {block("Sleep (optional) → “Sleep”", "Sleep Analysis", <>· <Code>Start Date is in the last 1 days</Code> · Add Filter <Code>Value is Asleep</Code> (tick Core, Deep, REM). Then <b className="text-ink">Get Details of Health Sample</b> → <Code>Duration</Code>, then <b className="text-ink">Calculate Statistics</b> → <Code>Sum</Code>.</>)}
          </div>
        </Step>
        <Step n={4}>
          <p>Add <b className="text-ink">Get Contents of URL</b>:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>URL: <Code>{syncUrl}</Code> {syncUrl.includes("localhost") ? <span className="text-warn">— on the iPhone use your Mac&apos;s address instead of “localhost”, e.g. http://aarzoos-macbook-air.local:3000/api/health/sync (System Settings → General → Sharing → Local hostname).</span> : null}</li>
            <li>Method: <Code>POST</Code></li>
            <li>Headers → Add: key <Code>Authorization</Code>, value <Code>Bearer</Code> + a space + your sync key</li>
            <li>Request Body: <Code>JSON</Code>, then add <b className="text-ink">Text</b> fields: <Code>steps</Code> = Steps, <Code>activeKcal</Code> = Active, <Code>weight</Code> = Weight, <Code>restingHr</Code> = RHR, <Code>sleepMinutes</Code> = Sleep (optional)</li>
          </ul>
          <p>Optionally add <b className="text-ink">Show Result</b> while testing. Tap ▶︎ — you should see <Code>&quot;ok&quot;: true</Code>, and “Last received” above updates when you reload this page.</p>
        </Step>
        <Step n={5}>
          <p>Make it automatic: Shortcuts → <b className="text-ink">Automation</b> → <b className="text-ink">+</b> → <b className="text-ink">Time of Day</b> → <Code>11:00 PM</Code>, <Code>Daily</Code> → <b className="text-ink">Run Immediately</b> (turn off “Notify When Run” if you like) → choose <Code>Send Health to HomeOS</Code>.</p>
        </Step>
      </ol>
      <div className="mt-4 space-y-1 border-t border-line pt-3 text-xs">
        <p>• The iPhone must be on the same Wi-Fi as the Mac, with HomeOS running, when it fires. If iOS asks to find devices on your local network, tap <b className="text-ink">Allow</b>.</p>
        <p>• Each run sends today&apos;s totals; running it again the same day simply updates them. If a night is missed (Mac asleep, away from home), the next Health export upload fills the gap without duplicates.</p>
        <p>• Keep the Mac awake while plugged in: System Settings → Battery → Options → “Prevent automatic sleeping on power adapter when the display is off”.</p>
        <p>• Workouts come from the Health export upload. Shortcuts can&apos;t read workout details reliably.</p>
      </div>
    </details>
  );
}

export function HealthIcon() { return <HeartPulse className="h-4 w-4 text-accent" />; }
