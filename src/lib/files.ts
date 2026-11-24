import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { uploadsDir } from "./paths";
import { sha256 } from "./auth/pin";

export const ALLOWED_MIME: Record<string, { ext: string; maxMb: number }> = {
  "image/jpeg": { ext: "jpg", maxMb: 20 },
  "image/png": { ext: "png", maxMb: 20 },
  "image/webp": { ext: "webp", maxMb: 20 },
  "image/gif": { ext: "gif", maxMb: 10 },
  "image/heic": { ext: "heic", maxMb: 20 },
  "image/heif": { ext: "heif", maxMb: 20 },
  "application/pdf": { ext: "pdf", maxMb: 25 },
  "video/mp4": { ext: "mp4", maxMb: 300 },
  "video/quicktime": { ext: "mov", maxMb: 300 },
  "video/webm": { ext: "webm", maxMb: 300 },
  "text/plain": { ext: "txt", maxMb: 2 },
};

export class UploadError extends Error {}

export async function saveUpload(
  file: { buffer: Buffer; name: string; type: string },
  opts: { ownerProfileId?: string | null; visibility?: "PRIVATE" | "SHARED"; purpose?: string },
) {
  const spec = ALLOWED_MIME[file.type];
  if (!spec) throw new UploadError(`Unsupported file type: ${file.type || "unknown"}`);
  if (file.buffer.length > spec.maxMb * 1024 * 1024) throw new UploadError(`File too large (max ${spec.maxMb} MB)`);
  if (file.buffer.length === 0) throw new UploadError("Empty file");
  const now = new Date();
  const rel = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), `${randomUUID()}.${spec.ext}`);
  const abs = path.join(uploadsDir(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);
  return prisma.uploadedFile.create({
    data: {
      ownerProfileId: opts.ownerProfileId ?? null,
      visibility: opts.visibility ?? "SHARED",
      storagePath: rel,
      originalName: file.name.slice(0, 200) || `upload.${spec.ext}`,
      mimeType: file.type,
      size: file.buffer.length,
      sha256: sha256(file.buffer),
      purpose: opts.purpose ?? "general",
    },
  });
}

export function absolutePath(storagePath: string) {
  const root = uploadsDir();
  const abs = path.resolve(root, storagePath);
  if (!abs.startsWith(root + path.sep)) throw new UploadError("Invalid path");
  return abs;
}

export async function readUpload(storagePath: string) {
  return fs.readFile(absolutePath(storagePath));
}

export async function deleteUpload(id: string) {
  const file = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!file) return;
  await prisma.uploadedFile.delete({ where: { id } });
  await fs.rm(absolutePath(file.storagePath), { force: true });
}

export async function fileFromFormData(entry: FormDataEntryValue | null) {
  if (!entry || typeof entry === "string" || entry.size === 0) return null;
  return { buffer: Buffer.from(await entry.arrayBuffer()), name: entry.name, type: entry.type };
}
