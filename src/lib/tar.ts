// Minimal POSIX ustar writer/reader (regular files only) for portable backup archives.
// Avoids adding a dependency; sufficient for HomeOS backups (db + uploads).
import fs from "node:fs/promises";
import path from "node:path";

function header(name: string, size: number, mtime: number) {
  const buf = Buffer.alloc(512, 0);
  let prefix = "";
  let n = name;
  if (Buffer.byteLength(n) > 100) {
    const cut = n.lastIndexOf("/", 155);
    prefix = n.slice(0, cut);
    n = n.slice(cut + 1);
    if (Buffer.byteLength(n) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`Path too long for tar: ${name}`);
  }
  buf.write(n, 0, 100, "utf8");
  buf.write("0000644\0", 100, 8, "ascii");
  buf.write("0000000\0", 108, 8, "ascii");
  buf.write("0000000\0", 116, 8, "ascii");
  buf.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  buf.write("        ", 148, 8, "ascii");
  buf.write("0", 156, 1, "ascii");
  buf.write("ustar\0", 257, 6, "ascii");
  buf.write("00", 263, 2, "ascii");
  buf.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return buf;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

export async function tarDirectory(dir: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (const rel of (await walk(dir)).sort()) {
    const data = await fs.readFile(path.join(dir, rel));
    const st = await fs.stat(path.join(dir, rel));
    chunks.push(header(rel.split(path.sep).join("/"), data.length, st.mtimeMs), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export async function untarToDirectory(archive: Buffer, dest: string) {
  let off = 0;
  const root = path.resolve(dest);
  const files: string[] = [];
  while (off + 512 <= archive.length) {
    const h = archive.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const prefix = h.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(h.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    off += 512;
    const full = prefix ? `${prefix}/${name}` : name;
    if (type === "0" || type === "\0") {
      const target = path.resolve(root, full);
      if (!target.startsWith(root + path.sep)) throw new Error("Unsafe path in archive");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, archive.subarray(off, off + size));
      files.push(full);
    }
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}
