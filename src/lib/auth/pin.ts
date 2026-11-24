import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function validatePinFormat(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { hash, salt };
}

/** A profile with no PIN accepts any confirmation (it has chosen not to be locked). */
export function confirmPin(profile: { pinHash: string | null; pinSalt: string | null }, pin: string | null | undefined) {
  if (!profile.pinHash || !profile.pinSalt) return true;
  return verifyPin(String(pin ?? ""), profile.pinHash, profile.pinSalt);
}

export function verifyPin(pin: string, hash: string | null, salt: string | null) {
  if (!hash || !salt) return false;
  const candidate = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

export function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}
