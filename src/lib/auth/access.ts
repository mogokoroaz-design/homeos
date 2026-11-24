import { prisma } from "../db";
import type { Viewer } from "./session";

export type AccessScope = "wellness" | "nutrition" | "fitness" | "habits";
export const ACCESS_SCOPES: AccessScope[] = ["wellness", "nutrition", "fitness", "habits"];

/** True when `viewer` may read `ownerProfileId`'s private records in `scope`. */
export async function canViewPersonal(viewer: Pick<Viewer, "profileId">, ownerProfileId: string, scope: AccessScope) {
  if (viewer.profileId === ownerProfileId) return true;
  const grant = await prisma.profileAccess.findUnique({
    where: { ownerProfileId_granteeProfileId_scope: { ownerProfileId, granteeProfileId: viewer.profileId, scope } },
  });
  return Boolean(grant);
}

export async function assertCanViewPersonal(viewer: Pick<Viewer, "profileId">, ownerProfileId: string, scope: AccessScope) {
  if (!(await canViewPersonal(viewer, ownerProfileId, scope))) throw new ForbiddenError("You do not have access to this profile's private records.");
}

export class ForbiddenError extends Error {}

/** Prisma where-clause for records with owner + visibility semantics (notes, files, events, reminders). */
export function visibleTo(viewer: Pick<Viewer, "profileId">) {
  return { OR: [{ visibility: "SHARED" }, { ownerProfileId: viewer.profileId }] };
}
