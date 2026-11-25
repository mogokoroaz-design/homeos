import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { createHousehold } from "@/lib/household";
import { resetDb } from "../helpers";
import { autoOpenProfile } from "@/lib/auth/session";
import { hashPin } from "@/lib/auth/pin";

let a: string, b: string;
beforeAll(async () => {
  await resetDb();
  await createHousehold({ householdName: "H", currency: "USD", profiles: [{ name: "Aarzoo", color: "#9cc2b0" }, { name: "Mehul", color: "#c4a68f" }] });
  [a, b] = (await prisma.householdProfile.findMany({ orderBy: { createdAt: "asc" } })).map((p) => p.id);
});

describe("opening HomeOS without a PIN screen", () => {
  it("reopens the device's last profile when it has no PIN, else the first without one", async () => {
    expect(await autoOpenProfile(undefined)).toBe(a);
    expect(await autoOpenProfile(b)).toBe(b);
    const { hash, salt } = hashPin("2468");
    await prisma.householdProfile.update({ where: { id: b }, data: { pinHash: hash, pinSalt: salt } });
    expect(await autoOpenProfile(b)).toBeNull(); // Mehul's device, Mehul has a PIN → ask for it
    expect(await autoOpenProfile(a)).toBe(a);
    await prisma.householdProfile.update({ where: { id: a }, data: { pinHash: hash, pinSalt: salt } });
    expect(await autoOpenProfile(undefined)).toBeNull(); // everyone has a PIN → profile picker
  });
});
