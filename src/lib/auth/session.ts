import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { newToken, sha256, verifyPin } from "./pin";
import { audit } from "../audit";
import { getSetting } from "../settings";

export const SESSION_COOKIE = "homeos_session";
/** Remembers which profile this device last used, so HomeOS can reopen it without a profile picker. */
export const LAST_PROFILE_COOKIE = "homeos_last_profile";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export interface Viewer {
  profileId: string;
  householdId: string;
  name: string;
  color: string;
  currency: string;
}

async function lockMinutes() {
  const v = Number(await getSetting("security.autoLockMinutes", "30"));
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export async function resolveSessionToken(token: string | undefined): Promise<Viewer | null> {
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { profile: { include: { household: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  const idleLimit = (await lockMinutes()) * 60_000;
  if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > idleLimit) {
    await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 30_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return {
    profileId: session.profileId,
    householdId: session.profile.householdId,
    name: session.profile.name,
    color: session.profile.color,
    currency: session.profile.household.currency,
  };
}

export async function getViewer(): Promise<Viewer | null> {
  const store = await cookies();
  return resolveSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For pages and server actions: redirects to the lock screen when no unlocked profile. */
/**
 * Reopens this device's profile after the idle timeout when it has no PIN — so uploads, server
 * actions and API calls behave like pages do. Only works where cookies can be written (server
 * actions and route handlers); in a page it returns null and the caller redirects via /open.
 */
async function reopenWithoutPin(): Promise<Viewer | null> {
  const store = await cookies();
  const profileId = await autoOpenProfile(store.get(LAST_PROFILE_COOKIE)?.value);
  if (!profileId) return null;
  const token = newToken();
  try {
    store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 }); // throws while rendering a page
  } catch {
    return null;
  }
  store.set(LAST_PROFILE_COOKIE, profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  await prisma.userSession.create({ data: { profileId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 86400_000) } });
  return resolveSessionToken(token);
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = (await getViewer()) ?? (await reopenWithoutPin());
  if (!viewer) {
    const household = await prisma.household.count();
    if (!household) redirect("/setup");
    const path = (await headers()).get("x-homeos-path");
    const next = path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/lock") ? path : "/today";
    // Opens the right profile directly when it has no PIN (cookies can only be set in a route handler).
    redirect(`/open?next=${encodeURIComponent(next)}`);
  }
  return viewer;
}

export class AuthError extends Error {}

/** For API routes: throws instead of redirecting. */
export async function requireApiViewer(): Promise<Viewer> {
  const viewer = (await getViewer()) ?? (await reopenWithoutPin());
  if (!viewer) throw new AuthError("Profile locked");
  return viewer;
}

export type UnlockResult = { ok: true } | { ok: false; error: string };

export async function unlockProfile(profileId: string, pin: string): Promise<UnlockResult> {
  const profile = await prisma.householdProfile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, error: "Profile not found" };
  if (profile.pinLockedUntil && profile.pinLockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((profile.pinLockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, error: `Too many attempts. Try again in ${mins} min.` };
  }
  if (profile.pinHash && !verifyPin(pin, profile.pinHash, profile.pinSalt)) {
    const attempts = profile.failedPinAttempts + 1;
    await prisma.householdProfile.update({
      where: { id: profileId },
      data: attempts >= MAX_ATTEMPTS
        ? { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
        : { failedPinAttempts: attempts },
    });
    await audit({ profileId, action: "auth.failed", entityType: "profile", entityId: profileId, summary: "Incorrect PIN" });
    return { ok: false, error: attempts >= MAX_ATTEMPTS ? `Too many attempts. Locked for ${LOCKOUT_MINUTES} min.` : "Incorrect PIN" };
  }
  await prisma.householdProfile.update({ where: { id: profileId }, data: { failedPinAttempts: 0, pinLockedUntil: null } });
  await startSession(profileId);
  await audit({ profileId, action: "auth.unlock", entityType: "profile", entityId: profileId, summary: `${profile.name} opened` });
  return { ok: true };
}

/** Creates a session for a profile on this device (callers must have verified the PIN, if any). */
export async function startSession(profileId: string) {
  const store = await cookies();
  const old = store.get(SESSION_COOKIE)?.value;
  if (old) await prisma.userSession.deleteMany({ where: { tokenHash: sha256(old) } });
  const token = newToken();
  await prisma.userSession.create({ data: { profileId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 86400_000) } });
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  store.set(LAST_PROFILE_COOKIE, profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
}

/** The profile this device can open without asking: the last one used if it has no PIN, else the first without a PIN. */
export async function autoOpenProfile(lastProfileId: string | undefined) {
  const profiles = await prisma.householdProfile.findMany({ select: { id: true, pinHash: true }, orderBy: { createdAt: "asc" } });
  const last = profiles.find((p) => p.id === lastProfileId);
  if (last) return last.pinHash ? null : last.id; // last person on this device has a PIN → ask for it
  return profiles.find((p) => !p.pinHash)?.id ?? null;
}

export async function lockSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.userSession.deleteMany({ where: { tokenHash: sha256(token) } });
  store.delete(SESSION_COOKIE);
}
