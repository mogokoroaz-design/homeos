"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Input, Select, Badge, buttonClass } from "../ui";
import { Dialog } from "../dialog";
import { addPhotoItemsAction } from "@/app/(app)/food/actions";

type Dest = "PANTRY" | "LIST";
type Loc = "FRIDGE" | "FREEZER" | "PANTRY" | "OTHER";
interface Row { key: number; include: boolean; name: string; qty: string; unit: string; location: Loc; foodItemId: string | null; destination: Dest; edited: boolean }
const UNITS = ["each", "g", "kg", "ml", "l", "lb", "oz", "cup", "tbsp", "tsp"];

/** Shrinks big phone photos before upload (faster OCR / vision, smaller files). */
async function downscale(file: File, max = 1800): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg") return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.88));
  } catch { return file; }
}

let seq = 0;

/** Photo of groceries / fridge / a product → reviewable list → Pantry or Shopping list. */
export function PhotoToPantry({ defaultDestination = "PANTRY" }: { defaultDestination?: Dest }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setOpen(true); setBusy(true); setError(null); setDone(null); setRows([]); setNotes([]); setPhotoId(null);
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append("file", await downscale(file), "food.jpg");
    try {
      const res = await fetch("/api/pantry/photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't read the photo"); return; }
      setPhotoId(data.photoId);
      setNotes(data.notes ?? []);
      setRows((data.items as { name: string; quantity: number | null; unit: string; location: Loc; foodItemId: string | null }[]).map((it) => ({
        key: ++seq, include: true, name: it.name, qty: it.quantity === null ? "" : String(it.quantity), unit: it.unit || "each",
        location: it.location, foodItemId: it.foodItemId, destination: defaultDestination, edited: false,
      })));
    } catch { setError("Couldn't reach HomeOS — is it still running?"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAll = (destination: Dest) => setRows((rs) => rs.map((r) => ({ ...r, destination })));
  const addRow = () => setRows((rs) => [...rs, { key: ++seq, include: true, name: "", qty: "", unit: "each", location: "PANTRY", foodItemId: null, destination: defaultDestination, edited: true }]);

  const chosen = rows.filter((r) => r.include && r.name.trim());
  const save = async () => {
    setSaving(true); setError(null);
    const res = await addPhotoItemsAction(JSON.stringify({
      photoId,
      items: chosen.map((r) => {
        const q = Number(r.qty.replace(",", "."));
        return { name: r.name.trim(), quantity: r.qty.trim() && q > 0 ? q : null, unit: r.unit, location: r.location, foodItemId: r.foodItemId, destination: r.destination, checked: r.edited };
      }),
    }));
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(res.message ?? "Added");
    setRows([]);
    router.refresh();
  };

  const close = () => { setOpen(false); if (preview) URL.revokeObjectURL(preview); setPreview(null); };

  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Food photo" data-testid="food-photo-input" onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" className={buttonClass("secondary", "md")} onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Add from photo</button>
      <Dialog open={open} onClose={close} title="Add from photo" wide>
        <div className="space-y-4">
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="Your photo" className="h-28 w-28 shrink-0 rounded-xl border border-line object-cover" /> : null}
            <div className="space-y-1 text-sm text-muted">
              {busy ? <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Looking at the photo on this computer… (can take up to a minute)</p> : null}
              {notes.map((n) => <p key={n}>{n}</p>)}
              {!busy && !done ? <p className="text-faint">Nothing is added until you press the button below. Untick anything wrong, fix amounts, and choose where each item goes.</p> : null}
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {done ? (
            <div className="space-y-3">
              <p role="status" className="text-accent">{done}.</p>
              <div className="flex gap-2"><Button variant="primary" onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Another photo</Button><Button onClick={close}>Close</Button></div>
            </div>
          ) : !busy ? (
            <>
              {rows.length ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Send all to:</span>
                  <Button size="sm" variant="ghost" onClick={() => setAll("PANTRY")}>Pantry (we have these)</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAll("LIST")}>Shopping list (need to buy)</Button>
                </div>
              ) : null}
              <ul className="space-y-2" aria-label="Detected items">
                {rows.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2" data-testid="photo-row">
                    <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Include ${r.name || "item"}`} className="h-4 w-4 accent-[var(--color-accent)]" />
                    <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value, foodItemId: null, edited: true })} aria-label="Item name" className="min-w-32 flex-1" placeholder="Item" />
                    <Input value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value, edited: true })} aria-label={`${r.name} quantity`} inputMode="decimal" placeholder="qty" className="w-20 text-right" />
                    <Select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value, edited: true })} aria-label={`${r.name} unit`} className="w-24">
                      {(UNITS.includes(r.unit) ? UNITS : [r.unit, ...UNITS]).map((u) => <option key={u}>{u}</option>)}
                    </Select>
                    <Select value={r.destination} onChange={(e) => update(r.key, { destination: e.target.value as Dest })} aria-label={`${r.name} goes to`} className="w-36">
                      <option value="PANTRY">→ Pantry</option>
                      <option value="LIST">→ Shopping list</option>
                    </Select>
                    {r.destination === "PANTRY" ? (
                      <Select value={r.location} onChange={(e) => update(r.key, { location: e.target.value as Loc })} aria-label={`${r.name} location`} className="w-28">
                        <option value="FRIDGE">Fridge</option><option value="FREEZER">Freezer</option><option value="PANTRY">Cupboard</option><option value="OTHER">Other</option>
                      </Select>
                    ) : null}
                    {!r.edited && r.destination === "PANTRY" ? <Badge tone="warn" title="Amount guessed from the photo — saved as estimated unless you change it">estimate</Badge> : null}
                    <button type="button" className={buttonClass("ghost", "iconSm")} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name}`}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={addRow}><Plus className="h-4 w-4" />Add item</Button>
                <span className="flex-1" />
                <Button variant="primary" disabled={!chosen.length || saving} onClick={() => void save()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Add {chosen.length} item{chosen.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
