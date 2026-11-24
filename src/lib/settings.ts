import { prisma } from "./db";

export async function getSetting(key: string, fallback: string) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getSettings(prefix: string) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: prefix } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
