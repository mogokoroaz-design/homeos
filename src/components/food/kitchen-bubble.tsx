"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, X, Send } from "lucide-react";
import { kitchenBubbleAction } from "@/app/(app)/food/actions";
import { SuggestionsView } from "./kitchen-suggestions";
import type { Suggestions } from "@/lib/food/suggest";
import { cn } from "@/lib/utils";

const SEEN = "homeos.kitchenBubble.seen";
const POP_PAGES = ["/food", "/food/pantry"];
const SLOT = "homeos.kitchenBubble.slot";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
function mealSlot(d = new Date()) {
  const h = d.getHours();
  const slot = h >= 6 && h < 11 ? "breakfast" : h >= 11 && h < 15 ? "lunch" : h >= 17 && h < 21 ? "dinner" : null;
  return slot ? `${d.toDateString()}:${slot}` : null;
}
/** Tell the bubble that food changed (photo, receipt, typed add) so it can pop up with ideas. */
export function notifyFoodChanged() { window.dispatchEvent(new Event("homeos:food-changed")); }

/** The kitchen assistant as a floating bubble on Food pages: pops up when new food comes in and around mealtimes. */
export function KitchenBubble() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [data, setData] = useState<{ s: Suggestions; latest: string | null } | null>(null);
  const [fresh, setFresh] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async (mayPop: boolean) => {
    const d = await kitchenBubbleAction().catch(() => null);
    if (!d) return;
    setData(d);
    const hasAnything = d.s.next.picks.length || d.s.useIt.length || d.s.ideas.length;
    const newFood = Boolean(d.latest && d.latest > (get(SEEN) ?? ""));
    const slot = mealSlot();
    const newSlot = Boolean(slot && slot !== get(SLOT) && d.s.next.picks.length);
    setFresh(Boolean(hasAnything && (newFood || newSlot)));
    // Pops a small preview by itself only where it won't cover what you're doing.
    if (mayPop && hasAnything && (newFood || newSlot) && POP_PAGES.includes(path)) setPeek(true);
  }, [path]);
  useEffect(() => { if (!peek) return; const t = setTimeout(() => setPeek(false), 15_000); return () => clearTimeout(t); }, [peek]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const onChange = () => setTimeout(() => void load(true), 400);
    window.addEventListener("homeos:food-changed", onChange);
    return () => window.removeEventListener("homeos:food-changed", onChange);
  }, [load]);
  useEffect(() => {
    if (!(open || peek) || !data) return;
    if (data.latest) put(SEEN, data.latest);
    const slot = mealSlot();
    if (slot) put(SLOT, slot);
    if (open) setFresh(false);
  }, [open, peek, data]);

  if (path === "/food/assistant") return null;
  return (
    <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open && data ? (
        <div role="dialog" aria-label="Kitchen assistant" className="pointer-events-auto w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <ChefHat className="h-5 w-5 text-accent" />
            <p className="flex-1 font-semibold">Kitchen assistant</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Close kitchen assistant"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[min(60vh,520px)] overflow-y-auto px-4 py-4">
            {data.s.next.picks.length || data.s.next.note || data.s.useIt.length || data.s.ideas.length ? <SuggestionsView s={data.s} /> : <p className="text-sm text-muted">Nothing to suggest yet — add food (photo, receipt or typing) or recipes and I’ll chime in.</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/food/assistant?q=${encodeURIComponent(q.trim())}`); }} className="flex gap-2 border-t border-line p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask: what can I cook tonight?" aria-label="Ask the kitchen assistant" className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-3 text-sm outline-none focus:border-accent/70" />
            <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-[#0d1512]" aria-label="Ask"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      ) : null}
      {peek && !open && data ? (
        <div role="note" aria-label="Kitchen assistant tip" className="pointer-events-auto flex w-[min(300px,calc(100vw-2rem))] items-start gap-2 rounded-2xl border border-line-strong bg-surface p-3 text-sm shadow-2xl shadow-black/40">
          <button type="button" onClick={() => { setPeek(false); setOpen(true); }} className="flex-1 text-left">
            <span className="block font-medium">{data.s.forNames.length && (data.s.useIt.length || data.s.ideas.length) ? `${data.s.useIt.length + data.s.ideas.length} ideas for ${data.s.forNames[0].toLowerCase()}` : "What to eat next"}</span>
            <span className="block text-xs text-muted">{data.s.next.picks[0] ? `Try ${data.s.next.picks[0].name}${data.s.next.picks[0].canCook ? " — you have everything" : ""}` : (data.s.useIt[0]?.name ?? data.s.ideas[0]?.title ?? "")} · tap to see</span>
          </button>
          <button type="button" onClick={() => setPeek(false)} className="rounded-md p-1 text-faint hover:text-ink" aria-label="Dismiss tip"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : null}
      <button type="button" onClick={() => { if (!open) void load(false); setPeek(false); setOpen(!open); }} aria-label={open ? "Hide kitchen assistant" : "Kitchen assistant"} aria-expanded={open}
        className={cn("pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-accent text-[#0d1512] shadow-xl shadow-black/40 transition hover:scale-105", fresh && !open && !peek && "animate-bounce")}>
        <ChefHat className="h-6 w-6" />
        {fresh && !open ? <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-warn" /> : null}
      </button>
    </div>
  );
}
