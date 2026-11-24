import { prisma, type Tx } from "../db";
import { today } from "../dates";

export async function currentTargets(profileId: string, date = today(), tx: Tx = prisma) {
  return tx.nutritionTarget.findFirst({ where: { profileId, effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
}
