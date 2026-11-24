"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { buttonClass } from "../ui";
import { cn } from "@/lib/utils";

type SR = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** Browser speech recognition (Safari/Chrome). Hidden where unsupported or not in a secure context. */
export function VoiceButton({ onText, className }: { onText: (t: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SR | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSupported(Boolean((w.SpeechRecognition || w.webkitSpeechRecognition) && window.isSecureContext));
  }, []);
  if (!supported) return null;
  const toggle = () => {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(" "); if (t) onText(t); };
    r.onend = () => setListening(false);
    r.onerror = (e) => { setError(e.error === "not-allowed" ? "Microphone permission denied" : e.error); setListening(false); };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  };
  return (
    <button type="button" onClick={toggle} title={error ?? (listening ? "Stop listening" : "Speak")} aria-label={listening ? "Stop voice input" : "Voice input"} className={cn(buttonClass(listening ? "primary" : "ghost", "icon"), className)}>
      {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </button>
  );
}
