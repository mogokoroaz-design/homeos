"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceButton } from "../assistant/voice";
import { classifyUtterance, splitList } from "@/lib/food/dictation";
import { addSpokenShoppingAction } from "@/app/(app)/food/actions";

/** Mic on the shopping list: “milk, eggs and 2 kg rice” → added. */
export function GroceryVoice() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const onText = async (text: string) => {
    const e = classifyUtterance(text);
    const names = e.kind === "shopping" && e.shopping?.length ? e.shopping : splitList(text.replace(/^(please\s+)?(add|buy|get)\s+/i, "").replace(/\s+(to|on) (the|my|our) (shopping |grocery )?list\.?$/i, "").replace(/[.!?]$/, ""));
    if (!names.length) return;
    setMsg(`Adding ${names.join(", ")}…`);
    const res = await addSpokenShoppingAction(names);
    setMsg(res.ok ? res.message ?? "Added" : res.error);
    router.refresh();
  };
  return (
    <span className="flex items-center gap-2">
      <VoiceButton onText={(t) => void onText(t)} />
      {msg ? <span role="status" className="text-sm text-muted">{msg}</span> : null}
    </span>
  );
}
