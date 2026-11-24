"use server";
import { redirect } from "next/navigation";
import { createHousehold, setupInput } from "@/lib/household";
import { lockSession, unlockProfile } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/validation";
import { zodMessage } from "@/lib/validation";
import { ZodError } from "zod";

export async function setupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const count = Number(fd.get("count") ?? 2);
  const profiles = Array.from({ length: count }, (_, i) => ({ name: String(fd.get(`name${i}`) ?? ""), pin: String(fd.get(`pin${i}`) ?? ""), color: String(fd.get(`color${i}`) ?? "#9cc2b0") }));
  for (let i = 0; i < count; i++) if (fd.get(`pin${i}`) !== fd.get(`pin${i}confirm`)) return { ok: false, error: `PINs for ${profiles[i].name || `person ${i + 1}`} don't match` };
  try {
    await createHousehold(setupInput.parse({ householdName: fd.get("householdName"), currency: String(fd.get("currency") ?? "USD").toUpperCase(), profiles }));
  } catch (e) {
    return { ok: false, error: e instanceof ZodError ? zodMessage(e) : e instanceof Error ? e.message : "Setup failed" };
  }
  redirect("/lock");
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
