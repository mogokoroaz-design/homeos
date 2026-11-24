"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireViewer, lockSession } from "@/lib/auth/session";
import { run, runVoid } from "@/lib/action";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/validation";
import { setSetting } from "@/lib/settings";
import { OllamaProvider, isLocalUrl } from "@/lib/ai/provider";
import { createBackup, restoreBackup, deleteBackup, erasePersonalData } from "@/lib/backup";
import { hashPin, verifyPin, validatePinFormat } from "@/lib/auth/pin";
import { audit } from "@/lib/audit";

export async function saveAISettingsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const provider = z.enum(["rules", "ollama"]).parse(fd.get("provider"));
    const url = String(fd.get("ollamaUrl") || "http://127.0.0.1:11434").trim();
    if (provider === "ollama" && !isLocalUrl(url)) throw new Error("For privacy, Ollama must run on this Mac or your local network.");
    await setSetting("ai.provider", provider);
    await setSetting("ai.ollamaUrl", url);
    await setSetting("ai.ollamaModel", String(fd.get("ollamaModel") || "llama3.2:3b").trim());
    await audit({ profileId: viewer.profileId, action: "settings.ai", entityType: "settings", summary: provider });
  }, "AI settings saved");
}
export async function testOllamaAction(url: string, model: string): Promise<{ ok: boolean; message: string }> {
  await requireViewer();
  if (!isLocalUrl(url)) return { ok: false, message: "Only local or LAN addresses are allowed." };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = data.models?.map((m) => m.name) ?? [];
    const ok = await new OllamaProvider(url, model).isAvailable();
    return { ok, message: ok ? `Connected. ${model} is available.` : `Ollama is running but “${model}” isn't installed. Installed: ${names.join(", ") || "none"}. Run: ollama pull ${model}` };
  } catch {
    return { ok: false, message: "Ollama isn't reachable. Install it from ollama.com (free), then run `ollama serve`." };
  }
}
export async function saveSecurityAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireViewer();
  return run(async () => { await setSetting("security.autoLockMinutes", String(z.coerce.number().int().min(1).max(1440).parse(fd.get("minutes")))); }, "Saved");
}
export async function changePinAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  return run(async () => {
    const p = await prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } });
    if (!verifyPin(String(fd.get("current")), p.pinHash, p.pinSalt)) throw new Error("Current PIN is incorrect");
    const next = String(fd.get("next"));
    if (!validatePinFormat(next)) throw new Error("PIN must be 4–8 digits");
    if (next !== fd.get("confirm")) throw new Error("New PINs don't match");
    const { hash, salt } = hashPin(next);
    await prisma.householdProfile.update({ where: { id: p.id }, data: { pinHash: hash, pinSalt: salt } });
    await prisma.userSession.deleteMany({ where: { profileId: p.id } });
    await audit({ profileId: p.id, action: "auth.pin_change", entityType: "profile", entityId: p.id, summary: "PIN changed" });
  }, "PIN changed — please unlock again");
}
export async function saveDashboardAction(fd: FormData) {
  const viewer = await requireViewer();
  await runVoid(async () => {
    const all = ["meals", "tasks", "routines", "agenda", "grocery", "bills", "expiring", "wellness", "projects", "notes", "spending"];
    const shown = new Set(fd.getAll("show").map(String));
    await prisma.householdProfile.update({ where: { id: viewer.profileId }, data: { dashboardConfig: JSON.stringify({ hidden: all.filter((w) => !shown.has(w)) }) } });
  });
}
export async function backupNowAction() {
  const viewer = await requireViewer();
  await runVoid(() => createBackup("manual", viewer.profileId));
}
export async function restoreAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const p = await prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } });
  if (!verifyPin(String(fd.get("pin") ?? ""), p.pinHash, p.pinSalt)) return { ok: false, error: "Incorrect PIN — restore cancelled" };
  try {
    await restoreBackup(String(fd.get("name")), viewer.profileId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }
  redirect("/lock");
}
export async function deleteBackupAction(fd: FormData) {
  await requireViewer();
  await runVoid(() => deleteBackup(String(fd.get("name"))));
}
export async function eraseMyDataAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  const p = await prisma.householdProfile.findUniqueOrThrow({ where: { id: viewer.profileId } });
  if (!verifyPin(String(fd.get("pin") ?? ""), p.pinHash, p.pinSalt)) return { ok: false, error: "Incorrect PIN" };
  if (fd.get("confirm") !== "ERASE") return { ok: false, error: "Type ERASE to confirm" };
  await createBackup("pre-erase", viewer.profileId);
  await erasePersonalData(viewer.profileId);
  await lockSession();
  redirect("/lock");
}
