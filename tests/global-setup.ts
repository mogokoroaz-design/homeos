import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default function setup() {
  const dir = path.resolve(__dirname, "../data/test");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execSync("npx prisma migrate deploy", { cwd: path.resolve(__dirname, ".."), env: { ...process.env, DATABASE_URL: "file:../data/test/test.db" }, stdio: "pipe" });
}
