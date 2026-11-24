import { prisma, type Tx } from "./db";

export async function audit(
  entry: { profileId?: string | null; action: string; entityType: string; entityId?: string | null; summary: string },
  tx: Tx = prisma,
) {
  await tx.auditLog.create({ data: { ...entry, summary: entry.summary.slice(0, 500) } });
}
