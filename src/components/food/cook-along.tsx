"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Pause, Play, Square, Trash2, Loader2, Check, ShoppingCart, Send } from "lucide-react";
import { Button, Card, Input, Select, Badge } from "../ui";
import { classifyUtterance, buildRecipeFromDictation, sessionCommand, asKind, type DictationEntry, type DictationKind } from "@/lib/food/dictation";
import { addSpokenShoppingAction } from "@/app/(app)/food/actions";
import { EMPTY_RECIPE } from "./recipe-editor";
import { cn } from "@/lib/utils";

type SR = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type Entry = DictationEntry & { status?: "adding" | "added" | "error"; statusText?: string };
interface Session { startedAt: number | null; pausedAt: number | null; pausedMs: number; entries: Entry[] }

const KEY = "homeos.cookAlong";
const EMPTY: Session = { startedAt: null, pausedAt: null, pausedMs: 0, entries: [] };
const KINDS: [DictationKind, string][] = [["step", "Step"], ["ingredient", "Ingredient"], ["shopping", "Shopping list"], ["note", "Note"], ["name", "Recipe name"], ["servings", "Servings"], ["ignore", "Ignore"]];

function load(): Session { try { const raw = localStorage.getItem(KEY); return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY; } catch { return EMPTY; } }
function persist(s: Session) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`; };

/** Cook while talking: a running timer, continuous listening, and a live log that becomes a recipe draft. */
export function CookAlong() {
  const router = useRouter();
  const [s, setS] = useState<Session>(EMPTY);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [voice, setVoice] = useState<"unknown" | "ok" | "insecure" | "unsupported">("unknown");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const rec = useRef<SR | null>(null);
  const want = useRef(false);
  const sRef = useRef(s);
  sRef.current = s;

  useEffect(() => {
    setS(load()); setNow(Date.now()); setReady(true);
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoice(!(w.SpeechRecognition || w.webkitSpeechRecognition) ? "unsupported" : window.isSecureContext ? "ok" : "insecure");
  }, []);
  useEffect(() => { if (ready) persist(s); }, [s, ready]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  // Keep the screen on while cooking.
  useEffect(() => {
    if (!s.startedAt) return;
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [s.startedAt]);

  const elapsedMs = (x: Session, t = Date.now()) => (x.startedAt ? (x.pausedAt ?? t) - x.startedAt - x.pausedMs : 0);
  const paused = Boolean(s.pausedAt);

  const update = (fn: (x: Session) => Session) => setS((x) => fn(x));
  const start = () => update((x) => (x.startedAt ? x : { ...x, startedAt: Date.now(), pausedAt: null, pausedMs: 0 }));
  const pause = () => update((x) => (x.startedAt && !x.pausedAt ? { ...x, pausedAt: Date.now() } : x));
  const resume = () => update((x) => (x.pausedAt ? { ...x, pausedMs: x.pausedMs + (Date.now() - x.pausedAt), pausedAt: null } : x));

  const addShopping = useCallback(async (id: string, names: string[]) => {
    setS((x) => ({ ...x, entries: x.entries.map((e) => (e.id === id ? { ...e, status: "adding" } : e)) }));
    const res = await addSpokenShoppingAction(names);
    setS((x) => ({ ...x, entries: x.entries.map((e) => (e.id === id ? { ...e, status: res.ok ? "added" : "error", statusText: res.ok ? res.message : res.error } : e)) }));
  }, []);

  const finish = useCallback(() => {
    const cur = sRef.current;
    want.current = false; rec.current?.stop();
    const draft = buildRecipeFromDictation(cur.entries, elapsedMs(cur) / 1000);
    try { sessionStorage.setItem("homeos.recipeDraft", JSON.stringify({ ...EMPTY_RECIPE, ...draft, name: draft.name || "Dictated recipe", sourceType: "DICTATED" })); } catch { /* ignore */ }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    router.push("/food/recipes/new?draft=1");
  }, [router]);

  /** One finished sentence — spoken or typed. */
  const heard = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    const cmd = sessionCommand(t);
    const cur = sRef.current;
    if (cmd === "pause") return pause();
    if (cmd === "resume") return resume();
    if (cmd === "finish") return finish();
    if (cmd === "undo") return update((x) => ({ ...x, entries: x.entries.filter((e) => e.id !== x.entries.at(-1)?.id || e.status === "added") }));
    if (cur.pausedAt) return; // while paused only commands count
    const e: Entry = classifyUtterance(t, Math.round(elapsedMs(cur) / 1000));
    if (!cur.startedAt) start();
    update((x) => ({ ...x, entries: [...x.entries, e] }));
    if (e.kind === "shopping" && e.shopping?.length) void addShopping(e.id, e.shopping);
  }, [addShopping, finish]);
  const heardRef = useRef(heard);
  heardRef.current = heard;

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev) => {
      let partial = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) heardRef.current(res[0].transcript); else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    // Browsers stop after silence — keep listening until the person stops.
    r.onend = () => { setInterim(""); if (want.current) { try { r.start(); } catch { setListening(false); } } else setListening(false); };
    r.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      want.current = false;
      setMicError(ev.error === "not-allowed" || ev.error === "service-not-allowed" ? "Microphone access was blocked. Allow it for this site in the browser settings, or type below." : `Voice stopped (${ev.error}).`);
    };
    rec.current = r; want.current = true; setMicError(null); setListening(true);
    try { r.start(); } catch { /* already started */ }
  };
  const stopListening = () => { want.current = false; rec.current?.stop(); setListening(false); };
  useEffect(() => () => { want.current = false; rec.current?.abort(); }, []);

  const beginCooking = () => { start(); if (voice === "ok") listen(); };
  const discard = () => { if (!confirm("Discard this cooking session?")) return; stopListening(); setS(EMPTY); };
  const setKind = (id: string, kind: DictationKind) => {
    const e = s.entries.find((x) => x.id === id);
    if (!e) return;
    const next: Entry = { ...asKind(e, kind), status: undefined };
    update((x) => ({ ...x, entries: x.entries.map((y) => (y.id === id ? next : y)) }));
    if (kind === "shopping" && next.shopping?.length) void addShopping(id, next.shopping);
  };

  if (!ready) return <p className="text-sm text-muted">Loading…</p>;
  const draft = buildRecipeFromDictation(s.entries, elapsedMs(s, now) / 1000);
  const shopping = s.entries.filter((e) => e.kind === "shopping");

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">{!s.startedAt ? "Not started" : paused ? "Paused" : "Cooking"}</p>
            <p className="tabular text-5xl font-semibold" aria-label="Cooking time" data-testid="cook-timer">{mmss(elapsedMs(s, now))}</p>
          </div>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            {!s.startedAt ? <Button variant="primary" size="lg" onClick={beginCooking}><Play className="h-5 w-5" />Start cooking</Button> : (
              <>
                {paused ? <Button size="lg" onClick={resume}><Play className="h-5 w-5" />Resume</Button> : <Button size="lg" onClick={pause}><Pause className="h-5 w-5" />Pause</Button>}
                {voice === "ok" ? (listening ? <Button size="lg" variant="ghost" onClick={stopListening} aria-label="Stop listening"><MicOff className="h-5 w-5" />Mic off</Button> : <Button size="lg" variant="ghost" onClick={listen} aria-label="Start listening"><Mic className="h-5 w-5" />Mic on</Button>) : null}
                <Button size="lg" variant="primary" onClick={finish} disabled={!s.entries.length}><Square className="h-5 w-5" />Finish &amp; review recipe</Button>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
          {listening ? (
            <p className="flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" /></span>
              {paused ? "Paused — say “resume” to carry on." : interim ? <span className="text-ink">{interim}…</span> : <span className="text-muted">Listening… just talk as you cook.</span>}</p>
          ) : voice === "insecure" ? (
            <p className="text-muted">The browser only allows the microphone on <b>localhost</b> or HTTPS, so voice is off on this device. <b>On iPad / iPhone:</b> tap the box below and use the 🎤 on the keyboard — each sentence you dictate is filed the same way.</p>
          ) : voice === "unsupported" ? (
            <p className="text-muted">This browser has no speech recognition. Use Safari or Chrome, or dictate with your keyboard’s microphone into the box below.</p>
          ) : (
            <p className="text-muted">Press <b>Start cooking</b>. The timer runs and HomeOS listens. Speech is turned into text by your browser (Safari uses Apple’s dictation); HomeOS stores only the text, on this Mac.</p>
          )}
          {micError ? <p role="alert" className="mt-1 text-warn">{micError}</p> : null}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); heard(typed); setTyped(""); }} className="mt-3 flex gap-2">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type or dictate a sentence, e.g. “add 2 tbsp soy sauce”" aria-label="Say or type what you're doing" />
          <Button type="submit" disabled={!typed.trim()} aria-label="Add sentence"><Send className="h-4 w-4" /></Button>
        </form>
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer text-faint">What can I say?</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            <li><b className="text-ink">“This recipe is called basil chicken”</b> — name</li>
            <li><b className="text-ink">“Add 500 grams minced chicken”</b> — ingredient + step</li>
            <li><b className="text-ink">“Two tablespoons soy sauce and one tablespoon sugar”</b> — ingredients</li>
            <li><b className="text-ink">“Fry the onions until golden”</b> — step (time is logged)</li>
            <li><b className="text-ink">“Add basil to the shopping list”</b> / <b className="text-ink">“we’re out of eggs”</b> — added to the list straight away</li>
            <li><b className="text-ink">“Serves four”</b> · <b className="text-ink">“Note: less chilli next time”</b></li>
            <li><b className="text-ink">“Pause”</b> · <b className="text-ink">“Resume”</b> · <b className="text-ink">“Scratch that”</b> · <b className="text-ink">“I’m done”</b></li>
          </ul>
        </details>
      </Card>

      {s.entries.length ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <ul className="divide-y divide-line" aria-label="What you said">
              {[...s.entries].reverse().map((e) => (
                <li key={e.id} className={cn("flex flex-wrap items-start gap-3 px-4 py-3", e.kind === "ignore" && "opacity-50")} data-testid="cook-entry">
                  <span className="w-12 shrink-0 pt-1 text-right text-xs tabular text-faint">{mmss(e.at * 1000)}</span>
                  <div className="min-w-48 flex-1">
                    <p>{e.text}</p>
                    {e.kind === "ingredient" ? <p className="text-xs text-info">{e.ingredients?.map((i) => [i.quantity ?? "", i.unit, i.name, i.note && `(${i.note})`].filter(Boolean).join(" ")).join(" · ")}</p> : null}
                    {e.kind === "shopping" ? (
                      <p className={cn("flex items-center gap-1 text-xs", e.status === "error" ? "text-danger" : "text-accent")}>
                        {e.status === "adding" ? <Loader2 className="h-3 w-3 animate-spin" /> : e.status === "added" ? <Check className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />}
                        {e.statusText ?? (e.status === "adding" ? "Adding…" : e.shopping?.join(", "))}
                      </p>
                    ) : null}
                    {e.kind === "name" || e.kind === "note" || e.kind === "servings" ? <p className="text-xs text-faint">{e.value}</p> : null}
                  </div>
                  {e.status === "added" ? <Badge tone="warn">on shopping list</Badge> : (
                    <Select value={e.kind} onChange={(ev) => setKind(e.id, ev.target.value as DictationKind)} aria-label={`Type of “${e.text}”`} className="h-9 w-36 text-sm">
                      {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  )}
                  <button type="button" onClick={() => update((x) => ({ ...x, entries: x.entries.filter((y) => y.id !== e.id) }))} className="p-2 text-faint hover:text-danger" aria-label={`Remove “${e.text}”`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="space-y-3 p-4 text-sm">
            <p className="font-semibold">{draft.name || "Untitled recipe"}</p>
            <p className="text-faint">{draft.servings} servings · {draft.cookMinutes ?? 0} min so far</p>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-faint">Ingredients ({draft.ingredients.length})</p>
              <ul className="space-y-0.5" aria-label="Draft ingredients">{draft.ingredients.map((i) => <li key={i.name + i.unit}>{[i.quantity ?? "", i.unit, i.name].filter(Boolean).join(" ")}</li>)}</ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-faint">Steps ({draft.instructions ? draft.instructions.split("\n").length : 0})</p>
              <ol className="list-decimal space-y-0.5 pl-5">{draft.instructions.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
            {shopping.length ? <p className="text-faint">{shopping.filter((e) => e.status === "added").length} shopping request(s) added to the list.</p> : null}
            <Button variant="ghost" size="sm" onClick={discard}><Trash2 className="h-4 w-4" />Discard session</Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
