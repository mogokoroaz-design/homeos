import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { backupsDir, databaseFile, uploadsDir } from "./paths";
import { tarDirectory, untarToDirectory } from "./tar";
import type { Viewer } from "./auth/session";
import { audit } from "./audit";

const NAME_RE = /^homeos-[0-9TZ-]+(-[a-z0-9-]+)?$/;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function createBackup(label = "manual", profileId?: string | null) {
  const name = `homeos-${stamp()}-${label.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "manual"}`;
  const dir = path.join(backupsDir(), name);
  await fs.mkdir(dir, { recursive: true });
  const dbOut = path.join(dir, "homeos.db");
  // VACUUM INTO produces a consistent snapshot even while the app is running.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dbOut.replace(/'/g, "''")}'`);
  await fs.cp(uploadsDir(), path.join(dir, "uploads"), { recursive: true }).catch((e) => { if (e.code !== "ENOENT") throw e; });
  const counts = { recipes: await prisma.recipe.count(), expenses: await prisma.expense.count(), notes: await prisma.note.count(), projects: await prisma.project.count() };
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ app: "homeos", format: 1, createdAt: new Date().toISOString(), label, counts }, null, 2));
  await audit({ profileId, action: "backup.create", entityType: "backup", entityId: name, summary: `Backup ${name}` });
  return name;
}

export async function listBackups() {
  await fs.mkdir(backupsDir(), { recursive: true });
  const out = [];
  for (const name of (await fs.readdir(backupsDir())).sort().reverse()) {
    if (!NAME_RE.test(name)) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(backupsDir(), name, "manifest.json"), "utf8"));
      const st = await fs.stat(path.join(backupsDir(), name, "homeos.db"));
      out.push({ name, createdAt: manifest.createdAt as string, label: manifest.label as string, counts: manifest.counts as Record<string, number>, dbBytes: st.size });
    } catch {
      /* incomplete backup folder — ignore */
    }
  }
  return out;
}

function backupPath(name: string) {
  if (!NAME_RE.test(name)) throw new Error("Invalid backup name");
  return path.join(backupsDir(), name);
}

export async function backupArchive(name: string) {
  return tarDirectory(backupPath(name));
}

async function validateBackupDir(dir: string) {
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.app !== "homeos") throw new Error("Not a HomeOS backup");
  const head = Buffer.alloc(16);
  const fh = await fs.open(path.join(dir, "homeos.db"), "r");
  await fh.read(head, 0, 16, 0);
  await fh.close();
  if (head.toString("latin1") !== "SQLite format 3\0") throw new Error("Backup database is not a SQLite file");
}

/** Restores a backup. A safety backup of the current state is always taken first. */
export async function restoreBackup(name: string, profileId?: string | null) {
  const dir = backupPath(name);
  await validateBackupDir(dir);
  const safety = await createBackup("pre-restore", profileId);
  await prisma.$disconnect();
  const db = databaseFile();
  await fs.copyFile(path.join(dir, "homeos.db"), db);
  await fs.rm(`${db}-wal`, { force: true });
  await fs.rm(`${db}-shm`, { force: true });
  await fs.rm(`${db}-journal`, { force: true });
  await fs.rm(uploadsDir(), { recursive: true, force: true });
  await fs.cp(path.join(dir, "uploads"), uploadsDir(), { recursive: true }).catch((e) => { if (e.code !== "ENOENT") throw e; });
  await prisma.$connect();
  // Sessions in the restored database belong to the past; require unlocking again.
  await prisma.userSession.deleteMany({});
  await audit({ profileId: null, action: "backup.restore", entityType: "backup", entityId: name, summary: `Restored ${name} (safety copy ${safety})` });
  return { safety };
}

export async function importBackupArchive(archive: Buffer) {
  const name = `homeos-${stamp()}-imported`;
  const dir = path.join(backupsDir(), name);
  await fs.mkdir(dir, { recursive: true });
  try {
    await untarToDirectory(archive, dir);
    await validateBackupDir(dir);
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
  return name;
}

export async function deleteBackup(name: string) {
  await fs.rm(backupPath(name), { recursive: true, force: true });
}

/** JSON export: shared household data + the requesting profile's own private data. Never another profile's private data or secrets. */
export async function exportForViewer(viewer: Pick<Viewer, "profileId" | "householdId">) {
  const me = viewer.profileId;
  const [household, profiles] = await Promise.all([
    prisma.household.findUnique({ where: { id: viewer.householdId } }),
    prisma.householdProfile.findMany({ select: { id: true, name: true, color: true } }),
  ]);
  const own = await prisma.householdProfile.findUnique({ where: { id: me }, omit: { pinHash: true, pinSalt: true, failedPinAttempts: true, pinLockedUntil: true } });
  return {
    exportedAt: new Date().toISOString(),
    format: "homeos-export-1",
    household, profiles, myProfile: own,
    shared: {
      foodItems: await prisma.foodItem.findMany(),
      recipes: await prisma.recipe.findMany({ include: { ingredients: true } }),
      mealPlan: await prisma.mealPlanItem.findMany({ include: { servings: true } }),
      pantry: await prisma.pantryItem.findMany(),
      inventoryTransactions: await prisma.inventoryTransaction.findMany(),
      groceryLists: await prisma.groceryList.findMany({ include: { items: true } }),
      expenses: await prisma.expense.findMany({ include: { category: true } }),
      budgets: await prisma.budget.findMany(),
      bills: await prisma.bill.findMany({ include: { payments: true, schedule: true } }),
      receipts: await prisma.receipt.findMany({ include: { items: true } }),
      products: await prisma.product.findMany({ include: { variants: { include: { priceRecords: true, brand: true } } } }),
      stores: await prisma.store.findMany(),
      tasks: await prisma.householdTask.findMany({ include: { schedule: true, completions: true } }),
      providers: await prisma.serviceProvider.findMany({ include: { visits: true } }),
      assets: await prisma.homeAsset.findMany(),
      maintenance: await prisma.maintenanceRecord.findMany(),
      events: await prisma.calendarEvent.findMany({ where: { visibility: "SHARED" } }),
      sharedNotes: await prisma.note.findMany({ where: { visibility: "SHARED" } }),
    },
    mine: {
      nutritionTargets: await prisma.nutritionTarget.findMany({ where: { profileId: me } }),
      foodLogs: await prisma.foodLog.findMany({ where: { profileId: me }, include: { items: true } }),
      metrics: await prisma.wellnessMetric.findMany({ where: { profileId: me } }),
      workouts: await prisma.workout.findMany({ where: { profileId: me } }),
      habits: await prisma.habit.findMany({ where: { profileId: me }, include: { logs: true } }),
      routines: await prisma.personalRoutine.findMany({ where: { profileId: me }, include: { completions: true } }),
      projects: await prisma.project.findMany({ where: { ownerProfileId: me }, include: { fields: true, entries: true, integrations: true, reminders: true } }),
      privateNotes: await prisma.note.findMany({ where: { ownerProfileId: me, visibility: "PRIVATE" } }),
      privateEvents: await prisma.calendarEvent.findMany({ where: { ownerProfileId: me, visibility: "PRIVATE" } }),
      conversations: await prisma.aIConversation.findMany({ where: { profileId: me }, include: { messages: true } }),
    },
  };
}

/** Erases the profile's personal (private) records. Shared household records are kept. */
export async function erasePersonalData(profileId: string) {
  await prisma.$transaction([
    prisma.foodLog.deleteMany({ where: { profileId } }),
    prisma.nutritionTarget.deleteMany({ where: { profileId } }),
    prisma.wellnessMetric.deleteMany({ where: { profileId } }),
    prisma.workout.deleteMany({ where: { profileId } }),
    prisma.habit.deleteMany({ where: { profileId } }),
    prisma.personalRoutine.deleteMany({ where: { profileId } }),
    prisma.project.deleteMany({ where: { ownerProfileId: profileId } }),
    prisma.note.deleteMany({ where: { ownerProfileId: profileId, visibility: "PRIVATE" } }),
    prisma.calendarEvent.deleteMany({ where: { ownerProfileId: profileId, visibility: "PRIVATE" } }),
    prisma.reminder.deleteMany({ where: { ownerProfileId: profileId, visibility: "PRIVATE" } }),
    prisma.aIConversation.deleteMany({ where: { profileId } }),
    prisma.aIAction.deleteMany({ where: { profileId } }),
    prisma.profileAccess.deleteMany({ where: { OR: [{ ownerProfileId: profileId }, { granteeProfileId: profileId }] } }),
  ]);
  await audit({ profileId, action: "privacy.erase", entityType: "profile", entityId: profileId, summary: "Erased personal data" });
}
