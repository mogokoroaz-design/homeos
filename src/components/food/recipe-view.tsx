"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, ChefHat, Timer, X, ChevronLeft, ChevronRight, Mic, MicOff, Volume2, VolumeX, ListChecks, CircleCheck, CircleAlert, Circle, ShoppingCart, Pause, Play, RotateCcw } from "lucide-react";
import { Card, CardHeader, Badge, Button, buttonClass } from "../ui";
import { InlineAction } from "../forms";
import { displayQuantity, findTimers, formatClock, type UnitSystem } from "@/lib/food/display";
import { addMissingToListAction, addSpokenShoppingAction } from "@/app/(app)/food/actions";
import { classifyUtterance } from "@/lib/food/dictation";
import { cn } from "@/lib/utils";

export interface ViewIngredient {
  id: string; name: string; note: string; optional: boolean; quantity: number | null; unit: string;
  gramsPerMl: number | null; gramsPerEach: number | null;
  inPantry: number; pantryConfidence: string; pantryKnown: boolean; // stock expressed in this ingredient's unit
}
export interface ViewRecipe { id: string; name: string; servings: number; steps: string[]; temperature: string; ingredients: ViewIngredient[] }

// ── Timers ──
interface RunningTimer { id: string; label: string; step: number; total: number; endsAt: number; pausedLeft: number | null; done: boolean }

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    }
    navigator.vibrate?.([300, 150, 300]);
  } catch { /* audio unavailable */ }
}

function useTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timers.some((t) => !t.done && t.pausedLeft === null)) return;
    const id = setInterval(() => {
      tick((x) => x + 1);
      setTimers((list) => list.map((t) => {
        if (!t.done && t.pausedLeft === null && Date.now() >= t.endsAt) { beep(); return { ...t, done: true }; }
        return t;
      }));
    }, 500);
    return () => clearInterval(id);
  }, [timers]);
  const start = useCallback((label: string, seconds: number, step: number) => {
    setTimers((l) => [...l, { id: `${Date.now()}-${Math.random()}`, label, step, total: seconds, endsAt: Date.now() + seconds * 1000, pausedLeft: null, done: false }]);
  }, []);
  const remove = (id: string) => setTimers((l) => l.filter((t) => t.id !== id));
  const toggle = (id: string) => setTimers((l) => l.map((t) => (t.id !== id || t.done ? t : t.pausedLeft === null ? { ...t, pausedLeft: t.endsAt - Date.now() } : { ...t, endsAt: Date.now() + t.pausedLeft, pausedLeft: null })));
  const restart = (id: string) => setTimers((l) => l.map((t) => (t.id === id ? { ...t, endsAt: Date.now() + t.total * 1000, pausedLeft: null, done: false } : t)));
  const left = (t: RunningTimer) => (t.done ? 0 : (t.pausedLeft ?? t.endsAt - Date.now()) / 1000);
  return { timers, start, remove, toggle, restart, left };
}

function TimerBar({ api, className }: { api: ReturnType<typeof useTimers>; className?: string }) {
  if (!api.timers.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {api.timers.map((t) => (
        <div key={t.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", t.done ? "animate-pulse border-warn bg-warn-dim text-warn" : "border-line-strong bg-surface-2")}>
          <Timer className="h-4 w-4" />
          <span className="text-xs text-muted">Step {t.step + 1}</span>
          <span className="min-w-14 text-lg font-semibold tabular">{t.done ? "Done!" : formatClock(api.left(t))}</span>
          {!t.done ? <button type="button" onClick={() => api.toggle(t.id)} className="p-1 text-muted hover:text-ink" aria-label={t.pausedLeft === null ? "Pause timer" : "Resume timer"}>{t.pausedLeft === null ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button> : <button type="button" onClick={() => api.restart(t.id)} className="p-1 text-muted hover:text-ink" aria-label="Restart timer"><RotateCcw className="h-4 w-4" /></button>}
          <button type="button" onClick={() => api.remove(t.id)} className="p-1 text-muted hover:text-ink" aria-label="Dismiss timer"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function storageGet(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* ignore */ } }

/** Interactive recipe: servings scaler, unit system, tick-off ingredients, step timers, cook mode. */
export function RecipeView({ recipe, initialServings }: { recipe: ViewRecipe; initialServings: number }) {
  const [servings, setServings] = useState(initialServings);
  const [system, setSystem] = useState<UnitSystem>("original");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cooking, setCooking] = useState(false);
  const timers = useTimers();
  const factor = servings / recipe.servings;
  useEffect(() => {
    const s = storageGet("homeos.units") as UnitSystem | null;
    if (s === "metric" || s === "imperial" || s === "original") setSystem(s);
    const c = storageGet(`homeos.recipe.${recipe.id}.checked`);
    if (c) setChecked(new Set(JSON.parse(c)));
  }, [recipe.id]);
  const setSys = (s: UnitSystem) => { setSystem(s); storageSet("homeos.units", s); };
  const toggleChecked = (id: string) => setChecked((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id);
    storageSet(`homeos.recipe.${recipe.id}.checked`, JSON.stringify([...n]));
    return n;
  });
  const step = servings < 2 ? 0.5 : 1;
  const rows = recipe.ingredients.map((i) => {
    const d = displayQuantity(i.quantity, i.unit, factor, system, i);
    const required = i.quantity === null ? null : i.quantity * factor;
    const status = required === null ? (i.inPantry > 0 ? "have" : "unknown") : !i.pantryKnown ? "unknown" : i.inPantry + 1e-9 >= required ? "have" : i.inPantry > 0 ? "partial" : "missing";
    const pantryText = status === "partial" ? `have ${displayQuantity(i.inPantry, i.unit, 1, system, i).text || i.inPantry}` : status === "have" && required !== null ? (i.pantryConfidence !== "CONFIRMED" ? `in pantry (${i.pantryConfidence.toLowerCase()})` : "in pantry") : status === "missing" ? "missing" : "";
    return { i, d, status, pantryText };
  });
  const missing = rows.filter((r) => !r.i.optional && (r.status === "missing" || r.status === "partial")).length;

  return (
    <>
      <Card>
        <CardHeader title="Ingredients" sub={`${recipe.ingredients.length} items · tap to tick off`} action={<Button variant="primary" onClick={() => setCooking(true)} disabled={!recipe.steps.length}><ChefHat className="h-4 w-4" />Cook mode</Button>} />
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <div className="flex items-center gap-1" role="group" aria-label="Servings">
            <button type="button" className={buttonClass("outline", "iconSm")} onClick={() => setServings((s) => Math.max(0.5, Math.round((s - step) * 2) / 2))} aria-label="Fewer servings"><Minus className="h-4 w-4" /></button>
            <span className="min-w-24 text-center text-sm"><span className="text-lg font-semibold tabular">{servings}</span> serving{servings === 1 ? "" : "s"}</span>
            <button type="button" className={buttonClass("outline", "iconSm")} onClick={() => setServings((s) => Math.round((s + (s < 2 ? 0.5 : 1)) * 2) / 2)} aria-label="More servings"><Plus className="h-4 w-4" /></button>
            {servings !== recipe.servings ? <button type="button" onClick={() => setServings(recipe.servings)} className="ml-1 text-xs text-info hover:underline">reset</button> : null}
          </div>
          <div className="ml-auto flex rounded-xl border border-line-strong p-0.5" role="group" aria-label="Units">
            {(["original", "metric", "imperial"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSys(s)} aria-pressed={system === s} className={cn("rounded-lg px-3 py-1.5 text-sm capitalize", system === s ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}>{s}</button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {rows.map(({ i, d, status, pantryText }) => {
            const done = checked.has(i.id);
            const icon = status === "have" ? <CircleCheck className="h-4 w-4 text-accent" /> : status === "partial" ? <CircleAlert className="h-4 w-4 text-warn" /> : status === "missing" ? <Circle className="h-4 w-4 text-danger" /> : <Circle className="h-4 w-4 text-faint" />;
            return (
              <li key={i.id}>
                <button type="button" onClick={() => toggleChecked(i.id)} className={cn("flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2", done && "opacity-45")} aria-pressed={done}>
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs", done ? "border-accent bg-accent text-[#0c1110]" : "border-line-strong")}>{done ? "✓" : ""}</span>
                  <span className={cn("w-24 shrink-0 font-medium tabular", done && "line-through")}>{d.text || "—"}</span>
                  <span className={cn("min-w-0 flex-1", done && "line-through")}>{i.name}{i.note ? <span className="text-faint">, {i.note}</span> : null}{i.optional ? <Badge className="ml-2">optional</Badge> : null}</span>
                  <span className="hidden items-center gap-1.5 text-xs text-faint sm:flex">{icon}{pantryText}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-xs text-faint">{system !== "original" ? "Converted amounts are rounded to kitchen measures; cups use the ingredient's density when known. " : ""}Pantry status is for {servings} serving{servings === 1 ? "" : "s"}.</p>
          {missing ? <InlineAction action={addMissingToListAction} fields={{ recipeId: recipe.id, servings }} variant="outline"><ShoppingCart className="h-4 w-4" />Add {missing} missing to list</InlineAction> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Method" sub={recipe.temperature ? `Oven ${recipe.temperature}` : undefined} />
        <div className="border-t border-line px-5 py-4">
          <TimerBar api={timers} className="mb-4" />
          {recipe.steps.length ? (
            <ol className="space-y-4">
              {recipe.steps.map((s, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-muted">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-relaxed">{s}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{findTimers(s).map((t) => <button key={t.label} type="button" onClick={() => timers.start(t.label, t.seconds, idx)} className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2 py-1 text-xs text-accent hover:bg-surface-2"><Timer className="h-3.5 w-3.5" />{t.label}</button>)}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">No method steps yet.</p>}
        </div>
      </Card>
      {cooking ? <CookMode recipe={recipe} rows={rows.map((r) => ({ id: r.i.id, qty: r.d.text, name: r.i.name, note: r.i.note }))} servings={servings} timers={timers} onClose={() => setCooking(false)} /> : null}
    </>
  );
}

// ── Cook mode ──

type SR = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

export function voiceCommand(transcript: string): "next" | "back" | "repeat" | "timer" | "ingredients" | "close" | null {
  const t = transcript.toLowerCase();
  if (/\b(next|forward|continue|done)\b/.test(t)) return "next";
  if (/\b(back|previous|go back|last step)\b/.test(t)) return "back";
  if (/\b(start|set) (a |the )?timer\b|\btimer\b/.test(t)) return "timer";
  if (/\b(repeat|read( it)?|again|what('?s| is) (this|the) step)\b/.test(t)) return "repeat";
  if (/\bingredients?\b/.test(t)) return "ingredients";
  if (/\b(exit|close|stop cooking|finish(ed)?)\b/.test(t)) return "close";
  return null;
}

function CookMode({ recipe, rows, servings, timers, onClose }: { recipe: ViewRecipe; rows: { id: string; qty: string; name: string; note: string }[]; servings: number; timers: ReturnType<typeof useTimers>; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [awake, setAwake] = useState<"on" | "unsupported" | "off">("off");
  const steps = recipe.steps;
  const stepTimers = useMemo(() => findTimers(steps[i] ?? ""), [steps, i]);
  const rec = useRef<SR | null>(null);
  const wantListening = useRef(false);
  const stateRef = useRef({ i, stepTimers });
  stateRef.current = { i, stepTimers };

  const say = useCallback((text: string) => {
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; window.speechSynthesis.speak(u); } catch { /* unsupported */ }
  }, []);
  const go = useCallback((d: number) => setI((x) => Math.min(steps.length - 1, Math.max(0, x + d))), [steps.length]);
  useEffect(() => { if (speak && steps[i]) say(`Step ${i + 1}. ${steps[i]}`); }, [i, speak, steps, say]);

  // Keep the screen awake while cooking (Screen Wake Lock API; needs HTTPS or localhost on iPad).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    const acquire = async () => {
      if (!nav.wakeLock) { setAwake("unsupported"); return; }
      try { lock = await nav.wakeLock.request("screen"); setAwake("on"); } catch { setAwake("unsupported"); }
    };
    void acquire();
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === " ") go(1); if (e.key === "ArrowLeft") go(-1); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { void lock?.release().catch(() => undefined); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; wantListening.current = false; rec.current?.abort(); try { window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  }, [go, onClose]);

  const voiceSupported = typeof window !== "undefined" && Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition) && window.isSecureContext;
  const toggleVoice = () => {
    if (listening) { wantListening.current = false; rec.current?.stop(); setListening(false); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const r = new Ctor();
    r.lang = navigator.language || "en-US"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      if (!res?.isFinal) return;
      const text = res[0].transcript;
      const shop = classifyUtterance(text);
      if (shop.kind === "shopping" && shop.shopping?.length) {
        setHeard(`Adding ${shop.shopping.join(", ")} to the shopping list…`);
        void addSpokenShoppingAction(shop.shopping).then((r) => { setHeard(r.ok ? `✓ ${r.message}` : r.error); say(r.ok ? `Added ${shop.shopping!.join(" and ")} to the shopping list` : "Sorry, that didn't work"); });
        return;
      }
      const cmd = voiceCommand(text);
      setHeard(cmd ? `“${text.trim()}”` : null);
      const { i: cur, stepTimers: st } = stateRef.current;
      if (cmd === "next") go(1);
      else if (cmd === "back") go(-1);
      else if (cmd === "repeat") say(`Step ${cur + 1}. ${steps[cur]}`);
      else if (cmd === "timer" && st[0]) { timers.start(st[0].label, st[0].seconds, cur); say(`Timer started for ${st[0].label}`); }
      else if (cmd === "ingredients") setShowIngredients((x) => !x);
      else if (cmd === "close") onClose();
    };
    r.onend = () => { if (wantListening.current) { try { r.start(); } catch { /* already started */ } } else setListening(false); };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { wantListening.current = false; setListening(false); setHeard("Microphone permission was denied."); } };
    rec.current = r; wantListening.current = true; setListening(true);
    try { r.start(); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`Cook mode: ${recipe.name}`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
        <ChefHat className="h-5 w-5 text-accent" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{recipe.name}</p><p className="text-xs text-muted">{servings} serving{servings === 1 ? "" : "s"}{recipe.temperature ? ` · oven ${recipe.temperature}` : ""}{awake === "on" ? " · screen stays on" : ""}</p></div>
        <button type="button" onClick={() => setShowIngredients((x) => !x)} className={buttonClass(showIngredients ? "secondary" : "ghost", "md")} aria-pressed={showIngredients}><ListChecks className="h-5 w-5" /><span className="hidden sm:inline">Ingredients</span></button>
        <button type="button" onClick={() => { setSpeak((x) => !x); if (speak) window.speechSynthesis?.cancel(); }} className={buttonClass(speak ? "secondary" : "ghost", "icon")} aria-pressed={speak} title="Read steps aloud" aria-label="Read steps aloud">{speak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
        {voiceSupported ? <button type="button" onClick={toggleVoice} className={buttonClass(listening ? "primary" : "ghost", "icon")} aria-pressed={listening} title="Hands-free: say next, back, repeat, start timer" aria-label="Voice control">{listening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</button> : null}
        <button type="button" onClick={onClose} className={buttonClass("ghost", "icon")} aria-label="Exit cook mode"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10">
          <div className="mb-6 flex gap-1.5" aria-hidden>{steps.map((_, k) => <button key={k} type="button" tabIndex={-1} onClick={() => setI(k)} className={cn("h-1.5 flex-1 rounded-full", k < i ? "bg-accent/60" : k === i ? "bg-accent" : "bg-surface-3")} />)}</div>
          <p className="text-sm font-semibold uppercase tracking-wider text-faint">Step {i + 1} of {steps.length}</p>
          <p className="mt-3 max-w-4xl text-[26px] leading-snug sm:text-[32px]" aria-live="polite">{steps[i]}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {stepTimers.map((t) => <Button key={t.label} size="lg" variant="outline" onClick={() => timers.start(t.label, t.seconds, i)}><Timer className="h-5 w-5" />Start {t.label} timer</Button>)}
          </div>
          <TimerBar api={timers} className="mt-6" />
          <div className="mt-auto pt-6">
            {listening ? <p className="mb-3 text-sm text-muted">Listening — say <b className="text-ink">next</b>, <b className="text-ink">back</b>, <b className="text-ink">repeat</b>, <b className="text-ink">start timer</b> or <b className="text-ink">ingredients</b>, or “add basil to the shopping list”.{heard ? ` Heard ${heard}` : ""}</p> : heard ? <p className="mb-3 text-sm text-warn">{heard}</p> : null}
            {awake === "unsupported" ? <p className="mb-3 text-xs text-faint">This browser can&apos;t keep the screen on automatically here (needs HTTPS on iPad). Set Settings → Display &amp; Brightness → Auto-Lock to Never while cooking.</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => go(-1)} disabled={i === 0} className="flex h-20 items-center justify-center gap-2 rounded-2xl border border-line-strong text-lg font-medium disabled:opacity-30"><ChevronLeft className="h-6 w-6" />Back</button>
              {i < steps.length - 1 ? <button type="button" onClick={() => go(1)} className="flex h-20 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-semibold text-[#0c1110]">Next<ChevronRight className="h-6 w-6" /></button>
                : <button type="button" onClick={onClose} className="flex h-20 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-semibold text-[#0c1110]">Done cooking</button>}
            </div>
          </div>
        </div>
        {showIngredients ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface px-4 py-4" aria-label="Ingredients">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Ingredients · {servings} servings</p>
            <ul className="space-y-2">{rows.map((r) => <li key={r.id} className="text-[17px]"><span className="font-semibold tabular">{r.qty}</span> {r.name}{r.note ? <span className="text-faint">, {r.note}</span> : null}</li>)}</ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

