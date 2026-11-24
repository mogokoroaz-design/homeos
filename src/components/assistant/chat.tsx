"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { ActionCard } from "./action-card";
import { VoiceButton } from "./voice";
import { Badge, Button, buttonClass } from "../ui";
import type { Card } from "@/lib/ai/assistant";
import { cn } from "@/lib/utils";

interface Msg { id: string; role: "user" | "assistant"; content: string; cards?: Card[]; provider?: string }

export function AssistantChat({ surface, suggestions, placeholder, storageKey, initialQuestion }: { surface: "KITCHEN" | "HOUSEHOLD"; suggestions: string[]; placeholder: string; storageKey: string; initialQuestion?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [statuses, setStatuses] = useState<Record<string, "PROPOSED" | "EXECUTED" | "REJECTED" | "FAILED">>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(storageKey); } catch { /* storage unavailable */ }
    if (!id) return;
    fetch(`/api/assistant?conversationId=${id}`).then(async (r) => {
      if (!r.ok) return;
      const h = await r.json();
      setConversationId(h.id);
      setMessages(h.messages.map((m: { id: string; role: "user" | "assistant"; content: string; data: string | null; provider: string }) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider, cards: m.data ? JSON.parse(m.data).cards : [] })));
      setStatuses(Object.fromEntries(h.actions.map((a: { id: string; status: string }) => [a.id, a.status])));
    }).catch(() => undefined);
  }, [storageKey]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  const send = async (t: string) => {
    const q = t.trim();
    if (!q || busy) return;
    setText("");
    setError(null);
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q, conversationId, surface }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setConversationId(data.conversationId);
      try { localStorage.setItem(storageKey, data.conversationId); } catch { /* ignore */ }
      setMessages((m) => [...m, data.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const asked = useRef(false);
  useEffect(() => {
    if (initialQuestion && !asked.current) { asked.current = true; void send(initialQuestion); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);
  const reset = () => { setMessages([]); setConversationId(null); try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };

  return (
    <div className="flex min-h-[60dvh] flex-col rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {!messages.length ? (
          <div className="py-6">
            <p className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-accent" />Ask about your household</p>
            <p className="mt-1 text-sm text-muted">Answers come from your own records. Changes are only proposed — you approve them.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line-strong px-3 py-1.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink">{s}</button>)}
            </div>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] space-y-3", m.role === "user" && "rounded-2xl rounded-br-md bg-accent-dim px-4 py-2.5 text-ink")}>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</p>
              {m.cards?.map((c, i) => <CardView key={i} card={c} status={c.type === "action" ? statuses[c.actionId] : undefined} />)}
              {m.role === "assistant" && m.provider && m.provider !== "rules" ? <Badge tone="info">local AI</Badge> : null}
            </div>
          </div>
        ))}
        {busy ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Thinking…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex items-center gap-2 border-t border-line p-3">
        {messages.length ? <Button type="button" variant="ghost" size="icon" onClick={reset} title="New conversation" aria-label="New conversation"><RotateCcw className="h-4 w-4" /></Button> : null}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-3.5 outline-none focus:border-accent/70" aria-label="Message" />
        <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
        <button type="submit" disabled={busy || !text.trim()} className={buttonClass("primary", "icon")} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}

function CardView({ card, status }: { card: Card; status?: "PROPOSED" | "EXECUTED" | "REJECTED" | "FAILED" }) {
  if (card.type === "note") return <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">{card.text}</p>;
  if (card.type === "action") return <ActionCard actionId={card.actionId} kind={card.kind} summary={card.summary} preview={card.preview} initialStatus={status ?? "PROPOSED"} />;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <p className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wider text-faint">{card.title}</p>
      <ul className="divide-y divide-line">
        {card.items.map((it, i) => {
          const inner = (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{it.label}</p>
                {it.detail ? <p className="text-xs text-muted">{it.detail}</p> : null}
              </div>
              {it.badge ? <Badge tone={it.tone === "ok" ? "accent" : it.tone === "warn" ? "warn" : "neutral"}>{it.badge}</Badge> : null}
            </div>
          );
          return <li key={i}>{it.href ? <Link href={it.href} className="block hover:bg-surface-3">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </div>
  );
}
