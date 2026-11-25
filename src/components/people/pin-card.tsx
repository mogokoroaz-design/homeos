"use client";
import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { ActionForm, SubmitButton } from "../forms";
import { Field, Input, Button } from "../ui";
import { Dialog } from "../dialog";
import { setPinAction } from "@/app/(app)/settings/actions";

/** Add, change or remove this profile's PIN. */
export function PinCard({ hasPin }: { hasPin: boolean }) {
  const [mode, setMode] = useState<"idle" | "set" | "remove">("idle");
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {hasPin ? <ShieldCheck className="h-5 w-5 text-accent" /> : <ShieldAlert className="h-5 w-5 text-warn" />}
        <p className="flex-1 text-sm">{hasPin ? "Your profile is locked with a PIN. Your private records (health, food log, projects, private notes) can only be opened by you." : "Your profile has no PIN, so anyone using this device can open it and see your private records. Add a PIN to keep them private."}</p>
        {mode === "idle" ? (
          <div className="flex gap-2">
            <Button variant={hasPin ? "outline" : "primary"} onClick={() => { setDone(null); setMode("set"); }}>{hasPin ? "Change PIN" : "Add a PIN"}</Button>
            {hasPin ? <Button variant="ghost" onClick={() => { setDone(null); setMode("remove"); }}>Remove PIN</Button> : null}
          </div>
        ) : null}
      </div>
      {mode !== "idle" ? (
        <ActionForm action={setPinAction} onSuccess={(r) => { setDone(r.ok ? r.message ?? "Saved" : null); setMode("idle"); }} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          {mode === "remove" ? <input type="hidden" name="remove" value="1" /> : null}
          {hasPin ? <Field label="Current PIN"><Input name="current" type="password" inputMode="numeric" autoComplete="current-password" required /></Field> : null}
          {mode === "set" ? <>
            <Field label={hasPin ? "New PIN (4–8 digits)" : "PIN (4–8 digits)"}><Input name="next" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required /></Field>
            <Field label="Repeat PIN"><Input name="confirm" type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required /></Field>
          </> : null}
          <div className="flex gap-2">
            <SubmitButton variant={mode === "remove" ? "danger" : "primary"}>{mode === "remove" ? "Remove PIN" : "Save PIN"}</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </ActionForm>
      ) : null}
      {done ? <p role="status" className="rounded-lg border border-[#38503f] bg-accent-dim px-3 py-2 text-sm text-accent">{done}</p> : null}
    </div>
  );
}

/** Compact button next to the person's name: "Set a PIN" (or "PIN on") opening the PIN settings. */
export function PinButton({ hasPin, name }: { hasPin: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={hasPin ? "outline" : "primary"} onClick={() => setOpen(true)}>
        {hasPin ? <ShieldCheck className="h-4 w-4 text-accent" /> : <ShieldAlert className="h-4 w-4" />}{hasPin ? "PIN on" : "Set a PIN"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={hasPin ? `${name}'s PIN` : `Set a PIN for ${name}`}>
        <PinCard hasPin={hasPin} />
      </Dialog>
    </>
  );
}
