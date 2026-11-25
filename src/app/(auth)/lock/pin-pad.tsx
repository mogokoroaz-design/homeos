"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { unlockAction } from "../actions";
import { cn } from "@/lib/utils";
import { Delete, Loader2 } from "lucide-react";

export function PinPad({ profiles, next, initialProfileId }: { profiles: { id: string; name: string; color: string; hasPin: boolean }[]; next: string; initialProfileId?: string }) {
  const preset = profiles.find((p) => p.id === initialProfileId && p.hasPin)?.id ?? (profiles.length === 1 && profiles[0].hasPin ? profiles[0].id : null);
  const [selected, setSelected] = useState<string | null>(preset);
  const openRef = useRef<HTMLFormElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (openId) openRef.current?.requestSubmit(); }, [openId]);
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState(unlockAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state && !state.ok) setPin(""); }, [state]);
  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  const profile = profiles.find((p) => p.id === selected);
  return (
    <div className="mt-8 w-full">
      <div className="flex flex-wrap justify-center gap-4">
        {profiles.map((p) => (
          <button key={p.id} type="button" disabled={pending} onClick={() => { if (!p.hasPin) { setSelected(null); if (openId === p.id) openRef.current?.requestSubmit(); else setOpenId(p.id); return; } setSelected(p.id); setPin(""); }} className={cn("flex w-32 flex-col items-center gap-3 rounded-2xl border p-5 transition", selected === p.id ? "border-accent/60 bg-surface-2" : "border-line bg-surface hover:bg-surface-2")}>
            <span className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold text-[#0c1110]" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
            <span className="font-medium">{p.name}</span>
            {!p.hasPin ? <span className="-mt-2 text-[11px] text-faint">{pending && openId === p.id ? "Opening…" : "No PIN"}</span> : null}
          </button>
        ))}
      </div>
      <form ref={openRef} action={action} className="hidden">
        <input type="hidden" name="profileId" value={openId ?? ""} />
        <input type="hidden" name="pin" value="" />
        <input type="hidden" name="next" value={next} />
      </form>
      {!selected && state && !state.ok ? <p role="alert" className="mt-4 text-center text-sm text-danger">{state.error}</p> : null}
      {profile ? (
        <form ref={formRef} action={action} className="mx-auto mt-8 w-full max-w-xs">
          <input type="hidden" name="profileId" value={profile.id} />
          <input type="hidden" name="next" value={next} />
          <label className="sr-only" htmlFor="pin">PIN for {profile.name}</label>
          <input id="pin" name="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} type="password" inputMode="numeric" autoComplete="off" autoFocus className="mb-4 h-12 w-full rounded-xl border border-line-strong bg-surface-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-accent/70" placeholder="PIN" />
          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="h-14 rounded-xl bg-surface-2 text-xl font-medium hover:bg-surface-3 active:bg-[#262b31]">{d}</button>
            ))}
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-14 items-center justify-center rounded-xl text-muted hover:bg-surface-2" aria-label="Delete digit"><Delete className="h-5 w-5" /></button>
            <button type="button" onClick={() => press("0")} className="h-14 rounded-xl bg-surface-2 text-xl font-medium hover:bg-surface-3">0</button>
            <button type="submit" disabled={pin.length < 4 || pending} className="flex h-14 items-center justify-center rounded-xl bg-accent font-semibold text-[#0c1110] disabled:opacity-40">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Unlock"}</button>
          </div>
          {state && !state.ok ? <p role="alert" className="mt-4 text-center text-sm text-danger">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
