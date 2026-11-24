"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Loader2, ScanLine, X } from "lucide-react";
import { ActionCard } from "../assistant/action-card";
import { VoiceButton } from "../assistant/voice";
import { Button, Input, Field, Select, buttonClass } from "../ui";
import { ActionForm, SubmitButton } from "../forms";
import { DialogButton } from "../dialog";
import { quickPantry } from "@/app/(app)/actions";
import { updatePantryAction, findByBarcodeAction } from "@/app/(app)/food/actions";
import { UnitSelect } from "../shell/quick-add";

/** Natural-language pantry entry → previewed change → approve. */
export function ConversationalPantry() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{ actionId: string; kind: string; summary: string; preview: unknown } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true); setCard(null); setMsg(null);
    const phrase = /^(we |i )?(just )?(bought|got|picked up|added|add|used|use|ate|finished|threw|consumed|have only|only have)/i.test(text.trim()) ? text : `we bought ${text}`;
    const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: phrase, surface: "KITCHEN" }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(data.error); return; }
    const c = data.message.cards?.find((x: { type: string }) => x.type === "action");
    if (c) setCard(c); else setMsg(data.message.content);
    setText("");
  };
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex items-center gap-2">
        <MessageSquarePlus className="h-5 w-5 shrink-0 text-accent" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell me what changed: “bought 2 kg rice and 12 eggs”, “used 200 g spinach”, “threw out the milk”" aria-label="Describe pantry change" />
        <VoiceButton onText={(t) => setText(t)} />
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}</Button>
      </form>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      {card ? <ActionCard {...card} onDone={() => setTimeout(() => setCard(null), 1500)} /> : null}
    </div>
  );
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

/** Camera barcode scanning via the BarcodeDetector API where the browser supports it; manual entry otherwise. */
export function BarcodeScan({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [manual, setManual] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { setSupported("BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia)); }, []);
  useEffect(() => {
    if (!open || !supported) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const det = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(async (s) => {
      stream = s;
      if (!video.current) return;
      video.current.srcObject = s;
      await video.current.play();
      const tick = async () => {
        if (stop || !video.current) return;
        const codes = await det.detect(video.current).catch(() => []);
        if (codes[0]) { onCode(codes[0].rawValue); setOpen(false); return; }
        requestAnimationFrame(tick);
      };
      void tick();
    }).catch(() => setSupported(false));
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [open, supported, onCode]);
  return (
    <>
      <button type="button" className={buttonClass("ghost", "md")} onClick={() => setOpen(true)}><ScanLine className="h-4 w-4" />Barcode</button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="font-semibold">Scan barcode</p><button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            {supported ? <video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline /> : <p className="mb-3 text-sm text-muted">This browser can&apos;t scan barcodes with the camera (Safari on iPad doesn&apos;t support the BarcodeDetector API). Type the number instead.</p>}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onCode(manual.trim()); setOpen(false); } }}>
              <Input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="Barcode number" />
              <Button type="submit" variant="primary">Use</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AddPantryForm() {
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <ActionForm action={quickPantry} successMessage onSuccess={() => setName("")} className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] sm:items-end">
      <Field label="Item"><Input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Spinach" /></Field>
      <Field label="Quantity"><Input name="quantity" inputMode="decimal" required /></Field>
      <Field label="Unit"><UnitSelect /></Field>
      <Field label="Location"><Select name="location" defaultValue=""><option value="">Auto</option><option value="FRIDGE">Fridge</option><option value="FREEZER">Freezer</option><option value="PANTRY">Pantry</option><option value="OTHER">Other</option></Select></Field>
      <Field label="Expiry"><Input name="expiryDate" type="date" /></Field>
      <div className="flex gap-1">
        <BarcodeScan onCode={async (code) => { const f = await findByBarcodeAction(code); if (f) { setName(f.name); setNote(null); } else setNote(`No ingredient with barcode ${code} yet — enter the name; you can save the barcode on the Ingredients page.`); }} />
        <SubmitButton>Add</SubmitButton>
      </div>
      {note ? <p className="col-span-full text-xs text-warn">{note}</p> : null}
    </ActionForm>
  );
}

export function EditPantryDialog({ item }: { item: { id: string; name: string; location: string; expiryDate: string | null; lowStockThreshold: number | null; confidence: string; unit: string } }) {
  return (
    <DialogButton label="Edit" title={`Edit ${item.name}`} variant="ghost" size="sm">
      {(close) => (
        <ActionForm action={updatePantryAction} onSuccess={close} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="id" value={item.id} />
          <Field label="Location"><Select name="location" defaultValue={item.location}><option value="FRIDGE">Fridge</option><option value="FREEZER">Freezer</option><option value="PANTRY">Pantry</option><option value="OTHER">Other</option></Select></Field>
          <Field label="Expiry"><Input name="expiryDate" type="date" defaultValue={item.expiryDate ?? ""} /></Field>
          <Field label={`Low-stock alert (${item.unit})`}><Input name="lowStock" inputMode="decimal" defaultValue={item.lowStockThreshold ?? ""} /></Field>
          <Field label="Quantity confidence"><Select name="confidence" defaultValue={item.confidence}><option value="CONFIRMED">Confirmed</option><option value="ESTIMATED">Estimated</option><option value="UNVERIFIED">Unverified</option></Select></Field>
          <div className="col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      )}
    </DialogButton>
  );
}
