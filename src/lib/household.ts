import { z } from "zod";
import { prisma } from "./db";
import { hashPin, validatePinFormat } from "./auth/pin";
import { ensureDefaultCategories } from "./finance/ledger";
import { audit } from "./audit";

export { PROFILE_COLORS } from "./household-colors";

export const setupInput = z.object({
  householdName: z.string().trim().min(1, "Household name is required").max(60),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  profiles: z.array(z.object({
    name: z.string().trim().min(1, "Each person needs a name").max(40),
    pin: z.string().refine(validatePinFormat, "PINs are 4–8 digits"),
    color: z.string(),
  })).min(1).max(6),
});

export async function householdExists() {
  return (await prisma.household.count()) > 0;
}

export async function createHousehold(input: z.infer<typeof setupInput>) {
  const data = setupInput.parse(input);
  if (await householdExists()) throw new Error("HomeOS is already set up");
  const names = data.profiles.map((p) => p.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("Profile names must be different");
  return prisma.$transaction(async (tx) => {
    const h = await tx.household.create({ data: { name: data.householdName, currency: data.currency } });
    for (const p of data.profiles) {
      const { hash, salt } = hashPin(p.pin);
      await tx.householdProfile.create({ data: { householdId: h.id, name: p.name, color: p.color, pinHash: hash, pinSalt: salt } });
    }
    await ensureDefaultCategories(tx);
    await audit({ action: "household.create", entityType: "household", entityId: h.id, summary: `${data.householdName} with ${data.profiles.length} profiles` }, tx);
    return h;
  });
}

export async function listProfiles() {
  return prisma.householdProfile.findMany({ select: { id: true, name: true, color: true, pinLockedUntil: true }, orderBy: { createdAt: "asc" } });
}
