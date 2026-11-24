"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "../forms";
import { DialogButton } from "../dialog";
import { Field, Input, Select, Button, buttonClass } from "../ui";
import { saveAISettingsAction, testOllamaAction, saveSecurityAction, changePinAction, restoreAction, eraseMyDataAction } from "@/app/(app)/settings/actions";

export function AISettings({ provider, url, model }: { provider: string; url: string; model: string }) {
  const [u, setU] = useState(url);
  const [m, setM] = useState(model);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <ActionForm action={saveAISettingsAction} resetOnSuccess={false} successMessage className="grid gap-3 sm:grid-cols-3">
      <Field label="Assistant engine"><Select name="provider" defaultValue={provider}><option value="rules">Rule-based only (default, no AI needed)</option><option value="ollama">Rules + local AI via Ollama</option></Select></Field>
      <Field label="Ollama address"><Input name="ollamaUrl" value={u} onChange={(e) => setU(e.target.value)} /></Field>
      <Field label="Model" hint="e.g. llama3.2:3b, qwen2.5:7b"><Input name="ollamaModel" value={m} onChange={(e) => setM(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setTest(await testOllamaAction(u, m)))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Test connection</Button>
        <SubmitButton>Save</SubmitButton>
        {test ? <span className={test.ok ? "text-sm text-accent" : "text-sm text-warn"}>{test.message}</span> : null}
      </div>
    </ActionForm>
  );
}

export function SecuritySettings({ minutes }: { minutes: string }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <ActionForm action={saveSecurityAction} resetOnSuccess={false} successMessage className="flex items-end gap-2">
        <Field label="Auto-lock after inactivity (minutes)"><Input name="minutes" inputMode="numeric" defaultValue={minutes} className="w-32" /></Field>
        <SubmitButton variant="secondary">Save</SubmitButton>
      </ActionForm>
      <ActionForm action={changePinAction} successMessage className="grid grid-cols-3 items-end gap-2">
        <Field label="Current PIN"><Input name="current" type="password" inputMode="numeric" required /></Field>
        <Field label="New PIN"><Input name="next" type="password" inputMode="numeric" required /></Field>
        <Field label="Confirm"><Input name="confirm" type="password" inputMode="numeric" required /></Field>
        <div className="col-span-3 flex justify-end"><SubmitButton variant="secondary">Change my PIN</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

export function RestoreDialog({ name }: { name: string }) {
  return (
    <DialogButton label="Restore" title={`Restore ${name}?`} variant="outline" size="sm">
      {() => (
        <ActionForm action={restoreAction} className="space-y-3">
          <input type="hidden" name="name" value={name} />
          <p className="text-sm text-muted">This replaces ALL current HomeOS data (both profiles) with the backup. A safety backup of the current state is made first. Everyone will need to unlock again.</p>
          <Field label="Your PIN to confirm"><Input name="pin" type="password" inputMode="numeric" required /></Field>
          <div className="flex justify-end"><SubmitButton variant="danger" pendingText="Restoring…">Restore backup</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}

export function ImportBackup() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button type="button" className={buttonClass("secondary", "md")} onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import backup file</button>
      <input ref={ref} type="file" accept=".tar,application/x-tar" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setBusy(true); setMsg(null);
        const fd = new FormData(); fd.append("file", f);
        const res = await fetch("/api/backup/import", { method: "POST", body: fd });
        const data = await res.json();
        setBusy(false);
        setMsg(res.ok ? `Imported as ${data.name}. Use Restore to apply it.` : data.error);
        router.refresh();
      }} />
      {msg ? <span className="text-sm text-muted">{msg}</span> : null}
    </div>
  );
}

export function EraseMyData() {
  return (
    <DialogButton label="Erase my personal data" title="Erase your personal data" variant="danger">
      {() => (
        <ActionForm action={eraseMyDataAction} className="space-y-3">
          <p className="text-sm text-muted">Deletes your food logs, targets, wellness metrics, workouts, habits, routines, projects, private notes, private events and assistant history. Shared household data (recipes, pantry, ledger, tasks) is kept. A backup is taken first.</p>
          <Field label="Your PIN"><Input name="pin" type="password" inputMode="numeric" required /></Field>
          <Field label="Type ERASE to confirm"><Input name="confirm" required /></Field>
          <div className="flex justify-end"><SubmitButton variant="danger">Erase permanently</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
