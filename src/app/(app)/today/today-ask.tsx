"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";

export function TodayAsk() {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/assistant?q=${encodeURIComponent(q.trim())}`); }} className="flex w-full max-w-md items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
      <Sparkles className="h-4 w-4 shrink-0 text-accent" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask HomeOS… e.g. what's happening this week?" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-faint" aria-label="Ask HomeOS" />
    </form>
  );
}
