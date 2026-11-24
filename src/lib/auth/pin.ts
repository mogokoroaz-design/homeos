import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export function validatePinFormat(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string) {
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
