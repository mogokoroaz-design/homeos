import path from "node:path";

export function dataDir() {
  return path.resolve(process.env.HOMEOS_DATA_DIR ?? path.join(process.cwd(), "data"));
}
export const uploadsDir = () => path.join(dataDir(), "uploads");
export const backupsDir = () => path.join(dataDir(), "backups");
export const cacheDir = () => path.join(dataDir(), "cache");

export function databaseFile() {
  const url = process.env.DATABASE_URL ?? "file:../data/homeos.db";
  const rel = url.replace(/^file:/, "");
  // Prisma resolves SQLite paths relative to prisma/schema.prisma.
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), "prisma", rel);
}
