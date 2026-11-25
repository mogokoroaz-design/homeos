"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Trash2, ScanBarcode, Salad, Check, Sparkles } from "lucide-react";
import { Button, Input, Select, Badge, buttonClass } from "../ui";
import { Dialog } from "../dialog";
import { addPhotoItemsAction, lookupBarcodeAction } from "@/app/(app)/food/actions";
import { KitchenSuggestions } from "./kitchen-suggestions";

type Dest = "PANTRY" | "LIST";
type Loc = "FRIDGE" | "FREEZER" | "PANTRY" | "OTHER";
type Nutrition = { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null };
interface Row {
  key: number; include: boolean; name: string; qty: string; unit: string; location: Loc; foodItemId: string | null; destination: Dest; edited: boolean;
  barcode: string | null; nutrition: Nutrition | null; nutritionSource?: "LABEL" | "OPEN_FOOD_FACTS"; hasNutrition: boolean; packaged: boolean;
  busy?: string | null; message?: string | null; showNutrition?: boolean;
}
interface Detected { name: string; quantity: number | null; unit: string; location: Loc; foodItemId: string | null; barcode?: string | null; nutrition?: Nutrition | null; hasNutrition?: boolean; packaged?: boolean }
const UNITS = ["each", "g", "kg", "ml", "l", "lb", "oz", "cup", "tbsp", "tsp"];
const NUTRIENTS: [keyof Nutrition, string][] = [["kcal", "kcal"], ["protein", "protein g"], ["carbs", "carbs g"], ["fat", "fat g"], ["fibre", "fibre g"]];

/** Shrinks big phone photos before upload (faster OCR / vision, smaller files). */
async function downscale(file: File, max = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg") return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch { return file; }
}

let seq = 0;
const toRow = (it: Detected, destination: Dest): Row => ({
  key: ++seq, include: true, name: it.name, qty: it.quantity === null ? "" : String(it.quantity), unit: it.unit || "each", location: it.location, foodItemId: it.foodItemId,
  destination, edited: !it.name, barcode: it.barcode ?? null, nutrition: it.nutrition ?? null, nutritionSource: it.nutrition ? "LABEL" : undefined,
  hasNutrition: Boolean(it.hasNutrition), packaged: Boolean(it.packaged), showNutrition: Boolean(it.nutrition),
});

/** Photo (camera or library) of groceries / fridge / a product → reviewable list → Pantry or Shopping list. */
export function PhotoToPantry({ defaultDestination = "PANTRY" }: { defaultDestination?: Dest }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const labelFor = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [lookupMode, setLookupMode] = useState<"ask" | "always" | "never">("ask");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; names: string[] } | null>(null);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const lookup = async (key: number, code: string, rememberChoice: boolean) => {
    update(key, { busy: "Looking up barcode…", message: null });
    const res = await lookupBarcodeAction(code, rememberChoice);
    if (!res.ok || !res.data) { update(key, { busy: null, message: res.ok ? "Not found" : res.error }); return; }
    const p = res.data;
    setRows((rs) => rs.map((r) => r.key !== key ? r : {
      ...r, busy: null, name: p.name, foodItemId: null, qty: p.quantity === null ? r.qty : String(p.quantity), unit: p.quantity === null ? r.unit : p.unit,
      nutrition: p.nutrition ?? r.nutrition, nutritionSource: p.nutrition ? "OPEN_FOOD_FACTS" : r.nutritionSource, showNutrition: Boolean(p.nutrition) || r.showNutrition,
      message: `From Open Food Facts${p.brand ? ` · ${p.brand}` : ""}${p.nutrition ? " · nutrition per 100 g included" : ""}`,
    }));
    if (rememberChoice) setLookupMode("always");
  };

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
      setLookupMode(data.barcodeLookup ?? "ask");
      const next = (data.items as Detected[]).map((it) => toRow(it, defaultDestination));
      setRows(next);
      // Already allowed: look the barcode up straight away.
      if (data.barcode && data.barcodeLookup === "always") for (const r of next) if (r.barcode && !r.hasNutrition) void lookup(r.key, r.barcode, false);
    } catch { setError("Couldn't reach HomeOS — is it still running on the Mac?"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const readLabel = async (file: File | undefined) => {
    const key = labelFor.current;
    if (!file || key === null) return;
    update(key, { busy: "Reading nutrition label…", message: null });
    const fd = new FormData();
    fd.append("file", await downscale(file, 2400), "label.jpg");
    try {
      const res = await fetch("/api/food/nutrition-label", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { update(key, { busy: null, message: data.error, showNutrition: true }); return; }
      setRows((rs) => rs.map((r) => r.key !== key ? r : { ...r, busy: null, nutrition: data.per100g, nutritionSource: "LABEL", showNutrition: true, barcode: r.barcode ?? data.barcode ?? null,
        message: data.basis === "serving" ? `Read per serving (${data.servingGrams} g) and converted to per 100 g — check the numbers.` : "Read per 100 g — check the numbers." }));
    } catch { update(key, { busy: null, message: "Couldn't reach HomeOS." }); }
    finally { if (labelInput.current) labelInput.current.value = ""; }
  };

  const setAll = (destination: Dest) => setRows((rs) => rs.map((r) => ({ ...r, destination })));
  const addRow = () => setRows((rs) => [...rs, toRow({ name: "", quantity: null, unit: "each", location: "PANTRY", foodItemId: null }, defaultDestination)]);
  const setNutrient = (key: number, k: keyof Nutrition, v: string) => setRows((rs) => rs.map((r) => r.key !== key ? r : { ...r, nutritionSource: r.nutritionSource ?? "LABEL", nutrition: { ...(r.nutrition ?? { kcal: null, protein: null, carbs: null, fat: null, fibre: null }), [k]: v.trim() === "" ? null : Number(v.replace(",", ".")) } }));

  const chosen = rows.filter((r) => r.include && r.name.trim());
  const save = async () => {
    setSaving(true); setError(null);
    const res = await addPhotoItemsAction(JSON.stringify({
      photoId,
      items: chosen.map((r) => {
        const q = Number(r.qty.replace(",", "."));
        const n = r.nutrition && Object.values(r.nutrition).some((v) => v !== null && Number.isFinite(v)) ? r.nutrition : null;
        return { name: r.name.trim(), quantity: r.qty.trim() && q > 0 ? q : null, unit: r.unit, location: r.location, foodItemId: r.foodItemId, destination: r.destination, checked: r.edited, barcode: r.barcode, nutrition: n, nutritionSource: n ? r.nutritionSource ?? "LABEL" : undefined };
      }),
    }));
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setDone({ message: res.message ?? "Added", names: chosen.filter((r) => r.destination === "PANTRY").map((r) => r.name.trim()) });
    setRows([]);
    router.refresh();
  };

  const close = () => { setOpen(false); if (preview) URL.revokeObjectURL(preview); setPreview(null); };

  return (
    <>
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Food photo" data-testid="food-photo-input" onChange={(e) => void pick(e.target.files?.[0])} />
      <input ref={labelInput} type="file" accept="image/*" className="hidden" aria-label="Nutrition label photo" data-testid="nutrition-photo-input" onChange={(e) => void readLabel(e.target.files?.[0])} />
      <button type="button" className={buttonClass("secondary", "md")} onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Add from photo</button>
      <Dialog open={open} onClose={close} title="Add from photo" wide>
        <div className="space-y-4">
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="Your photo" className="h-24 w-24 shrink-0 rounded-xl border border-line object-cover sm:h-28 sm:w-28" /> : null}
            <div className="space-y-1 text-sm text-muted">
              {busy ? <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Reading the photo on this Mac… (up to a minute)</p> : null}
              {notes.map((n) => <p key={n}>{n}</p>)}
              {!busy && !done && rows.length ? <p className="text-faint">Nothing is added until you press the button below.</p> : null}
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {done ? (
            <div className="space-y-4">
              <p role="status" className="flex items-center gap-2 text-accent"><Check className="h-4 w-4" />{done.message}.</p>
              {done.names.length ? <KitchenSuggestions names={done.names} compact /> : null}
              <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Another photo</Button><Button onClick={close}>Close</Button></div>
            </div>
          ) : !busy ? (
            <>
              {rows.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Send all to:</span>
                  <Button size="sm" variant="ghost" onClick={() => setAll("PANTRY")}>Pantry</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAll("LIST")}>Shopping list</Button>
                </div>
              ) : null}
              <ul className="space-y-2" aria-label="Detected items">
                {rows.map((r) => (
                  <li key={r.key} className="space-y-2 rounded-xl border border-line p-3" data-testid="photo-row">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Include ${r.name || "item"}`} className="h-4 w-4 accent-[var(--color-accent)]" />
                      <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value, foodItemId: null, hasNutrition: false, edited: true })} aria-label="Item name" className="min-w-36 flex-1" placeholder="Product name" />
                      <Input value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value, edited: true })} aria-label={`${r.name} quantity`} inputMode="decimal" placeholder="qty" className="w-20 text-right" />
                      <Select value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value, edited: true })} aria-label={`${r.name} unit`} className="w-24">
                        {(UNITS.includes(r.unit) ? UNITS : [r.unit, ...UNITS]).map((u) => <option key={u}>{u}</option>)}
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={r.destination} onChange={(e) => update(r.key, { destination: e.target.value as Dest })} aria-label={`${r.name} goes to`} className="w-40">
                        <option value="PANTRY">→ Pantry</option>
                        <option value="LIST">→ Shopping list</option>
                      </Select>
                      {r.destination === "PANTRY" ? (
                        <Select value={r.location} onChange={(e) => update(r.key, { location: e.target.value as Loc })} aria-label={`${r.name} location`} className="w-32">
                          <option value="FRIDGE">Fridge</option><option value="FREEZER">Freezer</option><option value="PANTRY">Cupboard</option><option value="OTHER">Other</option>
                        </Select>
                      ) : null}
                      {!r.edited && r.destination === "PANTRY" && r.qty === "" ? <Badge tone="warn" title="No amount read — saved as 1 (estimated) unless you fill it in">amount?</Badge> : null}
                      {r.hasNutrition || r.nutrition ? <Badge tone="accent">nutrition ✓</Badge> : null}
                      <span className="flex-1" />
                      <button type="button" className={buttonClass("ghost", "iconSm")} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {r.packaged || r.barcode || r.showNutrition ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {r.barcode && !r.hasNutrition && lookupMode !== "never" && r.nutritionSource !== "OPEN_FOOD_FACTS" ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="ghost" disabled={Boolean(r.busy)} onClick={() => void lookup(r.key, r.barcode!, remember)}><ScanBarcode className="h-4 w-4" />Look up barcode {r.barcode}</Button>
                            {lookupMode === "ask" ? <label className="flex items-center gap-1 text-xs text-faint"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />always</label> : null}
                          </span>
                        ) : null}
                        {!r.hasNutrition ? <Button size="sm" variant="ghost" disabled={Boolean(r.busy)} onClick={() => { labelFor.current = r.key; labelInput.current?.click(); }}><Salad className="h-4 w-4" />{r.nutrition ? "Re-read nutrition label" : "Nutrition label (back of pack)"}</Button> : null}
                        {!r.hasNutrition && !r.showNutrition ? <button type="button" className="text-xs text-info hover:underline" onClick={() => update(r.key, { showNutrition: true })}>type values</button> : null}
                        {r.busy ? <span className="flex items-center gap-1 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{r.busy}</span> : null}
                      </div>
                    ) : null}
                    {r.message ? <p className="text-xs text-muted">{r.message}</p> : null}
                    {r.showNutrition && !r.hasNutrition ? (
                      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-2" aria-label={`${r.name} nutrition per 100 g`}>
                        <span className="w-full text-xs text-faint">Per 100 g{r.barcode && r.nutritionSource === "OPEN_FOOD_FACTS" ? " (Open Food Facts)" : " (from the label)"}</span>
                        {NUTRIENTS.map(([k, label]) => (
                          <label key={k} className="flex flex-col text-xs text-muted">{label}
                            <input inputMode="decimal" value={r.nutrition?.[k] ?? ""} onChange={(e) => setNutrient(r.key, k, e.target.value)} aria-label={`${r.name} ${label}`} className="mt-0.5 h-9 w-20 rounded-lg border border-line-strong bg-surface px-2 text-right text-sm text-ink tabular outline-none focus:border-accent/70" />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!rows.length && !error ? <p className="text-sm text-faint">Add the items yourself, or try another photo.</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={addRow}><Plus className="h-4 w-4" />Add item</Button>
                <Button variant="ghost" onClick={() => input.current?.click()}><Camera className="h-4 w-4" />Different photo</Button>
                <span className="flex-1" />
                <Button variant="primary" disabled={!chosen.length || saving || rows.some((r) => r.busy)} onClick={() => void save()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Add {chosen.length} item{chosen.length === 1 ? "" : "s"}
                </Button>
              </div>
              <p className="text-xs text-faint">Barcode lookups use Open Food Facts, a free open database — only the barcode number is sent. Everything else is read on this Mac.</p>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
