// Recipe import with multiple extraction routes. External platforms (Instagram, YouTube) often
// restrict access to video/audio and even page text, so every route degrades to a manual path:
// paste the caption/transcript, or upload screenshots (OCR'd locally). Results are always a
// draft shown in an editable preview; nothing is saved without approval.
import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma } from "../db";
import { parseRecipeText, parseIngredientLine, decodeEntities, type ParsedRecipe } from "./parse";
import { ocrImage } from "../finance/ocr";
import { saveUpload } from "../files";
import { getLocalModel, extractJson } from "../ai/provider";
import type { Viewer } from "../auth/session";

export interface RecipeDraft {
  name: string;
  cuisine: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  temperature: string;
  instructions: string;
  sourceType: string;
  sourceUrl: string | null;
  notes: string;
  tags: string;
  ingredients: { name: string; quantity: number | null; unit: string; note: string; optional: boolean }[];
}

function fromParsed(p: ParsedRecipe, sourceType: string, sourceUrl: string | null): RecipeDraft {
  return {
    name: p.name, cuisine: "", servings: p.servings ?? 2, prepMinutes: p.prepMinutes, cookMinutes: p.cookMinutes, temperature: p.temperature,
    instructions: p.instructions.join("\n"), sourceType, sourceUrl, notes: p.notes, tags: "",
    ingredients: p.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional })),
  };
}

function isPrivateIp(ip: string) {
  if (net.isIPv6(ip)) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function safeFetch(url: string) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) links are supported");
  const { address } = await lookup(u.hostname);
  if (isPrivateIp(address)) throw new Error("Links to local network addresses are not imported");
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", accept: "text/html,application/xhtml+xml" } });
  if (!res.ok) throw new Error(`The site responded with ${res.status}`);
  const text = await res.text();
  return text.slice(0, 3_000_000);
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function isoDurationMinutes(d: unknown) {
  if (typeof d !== "string") return null;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 1440) + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null;
}

/** schema.org/Recipe JSON-LD — the most reliable route for public recipe websites. */
export function extractJsonLdRecipe(html: string, url: string): RecipeDraft | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const find = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const f = find(n); if (f) return f; } return null; }
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
    return find(o["@graph"]) ?? null;
  };
  for (const b of blocks) {
    let data: unknown;
    try { data = JSON.parse(b.trim()); } catch { continue; }
    const r = find(data);
    if (!r) continue;
    const steps: string[] = [];
    const walk = (x: unknown) => {
      if (typeof x === "string") steps.push(stripTags(x));
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (o.itemListElement) walk(o.itemListElement); else if (o.text) steps.push(stripTags(String(o.text)));
      }
    };
    walk(r.recipeInstructions);
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((l) => parseIngredientLine(stripTags(String(l))));
    const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    const servings = Number(String(yieldRaw ?? "").match(/\d+/)?.[0]) || 2;
    return {
      name: stripTags(String(r.name ?? "Imported recipe")).slice(0, 160),
      cuisine: stripTags(String(Array.isArray(r.recipeCuisine) ? r.recipeCuisine[0] ?? "" : r.recipeCuisine ?? "")),
      servings, prepMinutes: isoDurationMinutes(r.prepTime), cookMinutes: isoDurationMinutes(r.cookTime), temperature: "",
      instructions: steps.filter(Boolean).join("\n"), sourceType: "URL", sourceUrl: url, notes: "", tags: "",
      ingredients: ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note, optional: i.optional })),
    };
  }
  return null;
}

function metaContent(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : "";
}

export interface ImportOutcome { importId: string; draft: RecipeDraft | null; warnings: string[]; failed: boolean }

async function aiStructure(text: string): Promise<RecipeDraft | null> {
  const model = await getLocalModel();
  if (!model) return null;
  try {
    const out = await model.complete({
      system: "Extract a recipe from the text as JSON: {name, servings, prepMinutes, cookMinutes, temperature, ingredients:[{name, quantity (number|null), unit}], instructions:[string]}. Only use information present in the text. Do not add nutrition.",
      prompt: text.slice(0, 8000), json: true, maxTokens: 1200,
    });
    const j = extractJson(out) as Record<string, unknown>;
    const ings = Array.isArray(j.ingredients) ? j.ingredients : [];
    if (!ings.length) return null;
    return {
      name: String(j.name ?? "Imported recipe").slice(0, 160), cuisine: "", servings: Number(j.servings) || 2,
      prepMinutes: Number(j.prepMinutes) || null, cookMinutes: Number(j.cookMinutes) || null, temperature: String(j.temperature ?? ""),
      instructions: (Array.isArray(j.instructions) ? j.instructions : []).map(String).join("\n"), sourceType: "TEXT", sourceUrl: null, notes: "", tags: "",
      ingredients: ings.slice(0, 60).map((i: Record<string, unknown>) => ({ name: String(i.name ?? "").slice(0, 160), quantity: Number(i.quantity) > 0 ? Number(i.quantity) : null, unit: String(i.unit ?? ""), note: "", optional: false })).filter((i) => i.name),
    };
  } catch {
    return null;
  }
}

async function finish(method: string, viewer: Pick<Viewer, "profileId">, rawText: string, draft: RecipeDraft | null, warnings: string[], extra: { sourceUrl?: string | null; fileId?: string | null; error?: string } = {}): Promise<ImportOutcome> {
  let d = draft;
  if ((!d || !d.ingredients.length) && rawText.trim().length > 40) {
    const ai = await aiStructure(rawText);
    if (ai) { d = { ...ai, sourceType: d?.sourceType ?? ai.sourceType, sourceUrl: extra.sourceUrl ?? null }; warnings.push("Structured with local AI — verify every quantity."); }
  }
  const failed = !d || (!d.ingredients.length && !d.instructions);
  const rec = await prisma.recipeImport.create({
    data: { method, sourceUrl: extra.sourceUrl ?? null, rawText: rawText.slice(0, 50000), extracted: JSON.stringify(d ?? {}), warnings: JSON.stringify(warnings), status: failed ? "FAILED" : "PENDING_REVIEW", error: extra.error ?? (failed ? "Nothing recipe-like could be extracted." : null), fileId: extra.fileId ?? null, createdByProfileId: viewer.profileId },
  });
  return { importId: rec.id, draft: d, warnings, failed };
}

export async function importFromUrl(url: string, viewer: Pick<Viewer, "profileId">): Promise<ImportOutcome> {
  const warnings: string[] = [];
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const platform = /instagram\.com$/.test(host) ? "INSTAGRAM" : /(youtube\.com|youtu\.be)$/.test(host) ? "YOUTUBE" : /tiktok\.com$/.test(host) ? "TIKTOK" : "URL";
  let html = "";
  try {
    html = await safeFetch(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return finish(platform, viewer, "", null, [`Couldn't open the link (${msg}).`, ...manualHint(platform)], { sourceUrl: url, error: msg });
  }
  if (platform === "URL") {
    const ld = extractJsonLdRecipe(html, url);
    if (ld && ld.ingredients.length) return finish("URL", viewer, "", ld, warnings, { sourceUrl: url });
    warnings.push("The page has no structured recipe data; extracted from page text instead.");
    const body = stripTags(html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|li|h\d|div|br)>/gi, "\n"));
    const parsed = parseRecipeText(body.split(/\s{2,}|\n/).join("\n"), metaContent(html, "og:title") || "Imported recipe");
    return finish("URL", viewer, body.slice(0, 20000), fromParsed(parsed, "URL", url), [...warnings, ...parsed.warnings], { sourceUrl: url });
  }
  // Social/video platforms: use the public caption/description when the page exposes it.
  let caption = metaContent(html, "og:description") || metaContent(html, "description");
  if (platform === "YOUTUBE") {
    const sd = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (sd) caption = JSON.parse(`"${sd[1]}"`);
  }
  const title = metaContent(html, "og:title");
  if (!caption || caption.length < 40) {
    return finish(platform, viewer, caption, null, [`${platform === "INSTAGRAM" ? "Instagram" : platform === "YOUTUBE" ? "YouTube" : "This platform"} didn't expose the recipe text to HomeOS (it often requires login or blocks automated access).`, ...manualHint(platform)], { sourceUrl: url, error: "Caption not accessible" });
  }
  // Instagram's og:title repeats the caption ("Name on Instagram: \"…\"") — only use a title that adds something.
  const cleanTitle = /on Instagram|on TikTok|^Instagram$/i.test(title) || caption.includes(title.slice(0, 40)) ? "" : title;
  const parsed = parseRecipeText(cleanTitle ? `${cleanTitle}\n${caption}` : caption, cleanTitle || "Imported recipe");
  warnings.push("Extracted from the post caption/description. Video audio is not transcribed — if quantities are only spoken in the video, paste a transcript.");
  return finish(platform, viewer, caption, fromParsed(parsed, platform, url), [...warnings, ...parsed.warnings], { sourceUrl: url });
}

function manualHint(platform: string) {
  return platform === "URL"
    ? ["Paste the recipe text instead, or upload screenshots."]
    : ["Alternatives that always work: paste the caption or transcript (Text tab), or upload screenshots of the recipe (Screenshot tab — read locally with OCR)."];
}

export async function importFromText(text: string, method: "TEXT" | "TRANSCRIPT", viewer: Pick<Viewer, "profileId">, sourceUrl?: string | null) {
  const parsed = parseRecipeText(text);
  return finish(method, viewer, text, fromParsed(parsed, method, sourceUrl ?? null), parsed.warnings, { sourceUrl });
}

export async function importFromScreenshots(files: { buffer: Buffer; name: string; type: string }[], viewer: Pick<Viewer, "profileId">) {
  const texts: string[] = [];
  let firstId: string | null = null;
  const warnings: string[] = [];
  for (const f of files.slice(0, 8)) {
    if (!f.type.startsWith("image/")) { warnings.push(`${f.name}: not an image, skipped`); continue; }
    const stored = await saveUpload(f, { ownerProfileId: viewer.profileId, visibility: "SHARED", purpose: "import" });
    firstId ??= stored.id;
    try {
      const r = await ocrImage(f.buffer);
      texts.push(r.text);
      if (r.confidence < 60) warnings.push(`${f.name}: low OCR confidence (${Math.round(r.confidence)}%) — check the text carefully.`);
    } catch (e) {
      warnings.push(`${f.name}: OCR failed (${e instanceof Error ? e.message : "error"})`);
    }
  }
  const text = texts.join("\n");
  const parsed = parseRecipeText(text);
  return finish("SCREENSHOT", viewer, text, fromParsed(parsed, "SCREENSHOT", null), [...warnings, ...parsed.warnings], { fileId: firstId });
}

/** Video files are stored with the import; local speech-to-text isn't bundled, so a transcript is requested. */
export async function importFromVideo(file: { buffer: Buffer; name: string; type: string }, transcript: string, viewer: Pick<Viewer, "profileId">) {
  const stored = await saveUpload(file, { ownerProfileId: viewer.profileId, visibility: "SHARED", purpose: "import" });
  const warnings = ["HomeOS stores the video but does not transcribe audio locally. The draft below comes from the transcript/caption you provided."];
  if (!transcript.trim()) return finish("VIDEO", viewer, "", null, [...warnings, "Add the transcript or caption text to extract the recipe."], { fileId: stored.id, error: "Transcript required" });
  const parsed = parseRecipeText(transcript);
  return finish("VIDEO", viewer, transcript, fromParsed(parsed, "VIDEO", null), [...warnings, ...parsed.warnings], { fileId: stored.id });
}

/** Re-runs extraction on an import's stored source text (e.g. after parser improvements). */
export async function reextractImport(importId: string) {
  const imp = await prisma.recipeImport.findUniqueOrThrow({ where: { id: importId } });
  if (!imp.rawText.trim()) throw new Error("This import has no stored text to re-read. Try another import method.");
  const parsed = parseRecipeText(imp.rawText);
  const prev = JSON.parse(imp.extracted || "{}") as Partial<RecipeDraft>;
  const draft = fromParsed(parsed, prev.sourceType ?? imp.method, imp.sourceUrl);
  await prisma.recipeImport.update({ where: { id: importId }, data: { extracted: JSON.stringify(draft), warnings: JSON.stringify(parsed.warnings), status: imp.status === "SAVED" ? "SAVED" : "PENDING_REVIEW", error: null } });
}
