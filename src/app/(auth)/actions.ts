"use server";
import { redirect } from "next/navigation";
import { createHousehold, setupInput } from "@/lib/household";
import { lockSession, unlockProfile, startSession, getViewer, autoOpenProfile, LAST_PROFILE_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/validation";
import { zodMessage } from "@/lib/validation";
import { ZodError } from "zod";

export async function setupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const count = Number(fd.get("count") ?? 2);
  // PINs are optional at setup — each person can add one later from their profile.
  const profiles = Array.from({ length: count }, (_, i) => ({ name: String(fd.get(`name${i}`) ?? ""), color: String(fd.get(`color${i}`) ?? "#9cc2b0") }));
  try {
    await createHousehold(setupInput.parse({ householdName: fd.get("householdName"), currency: String(fd.get("currency") ?? "USD").toUpperCase(), profiles }));
  } catch (e) {
    return { ok: false, error: e instanceof ZodError ? zodMessage(e) : e instanceof Error ? e.message : "Setup failed" };
  }
  const first = await prisma.householdProfile.findFirst({ orderBy: { createdAt: "asc" } });
  if (first) await startSession(first.id);
  redirect("/today");
}

function safeNext(raw: string | null | undefined) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/api") && !raw.startsWith("/lock") && !raw.startsWith("/open") ? raw : "/today";
}

/** Opens the device's profile directly when it has no PIN; otherwise shows the profile picker / PIN pad. */
export async function openProfileAction(nextPath: string) {
  const next = safeNext(nextPath);
  if (!(await prisma.household.count())) redirect("/setup");
  if (await getViewer()) redirect(next);
  const last = (await cookies()).get(LAST_PROFILE_COOKIE)?.value;
  const id = await autoOpenProfile(last);
  if (!id) redirect(`/lock?next=${encodeURIComponent(next)}${last ? `&profile=${last}` : ""}`);
  await startSession(id);
  redirect(next);
}

/** Switch to another household member: opens their profile directly, or asks for their PIN if they set one. */
export async function switchProfileAction(fd: FormData) {
  const id = String(fd.get("profileId"));
  const target = await prisma.householdProfile.findUnique({ where: { id }, select: { id: true, name: true, pinHash: true } });
  if (!target) redirect("/today");
  const current = await getViewer();
  if (current?.profileId === target.id) redirect("/people");
  if (target.pinHash) redirect(`/lock?profile=${target.id}&next=/people`);
  await startSession(target.id);
  await audit({ profileId: target.id, action: "auth.switch", entityType: "profile", entityId: target.id, summary: `Switched to ${target.name}` });
  redirect("/people");
}

export async function unlockAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await unlockProfile(String(fd.get("profileId")), String(fd.get("pin") ?? ""));
  if (!r.ok) return r;
  redirect(String(fd.get("next") || "/today"));
}

export async function lockAction() {
  await lockSession();
  redirect("/lock");
}
