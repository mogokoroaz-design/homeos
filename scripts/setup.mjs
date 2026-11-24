// One-time local setup: node scripts/setup.mjs (or `npm run setup`)
import { execSync } from "node:child_process";
import fs from "node:fs";

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`HomeOS needs Node.js 20 or newer (found ${process.versions.node}). Install the LTS from https://nodejs.org (free).`);
  process.exit(1);
}
if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
fs.mkdirSync("data", { recursive: true });
const run = (cmd) => { console.log(`\n› ${cmd}`); execSync(cmd, { stdio: "inherit" }); };
run("npx prisma migrate deploy");
run("npx next build");
console.log("\nHomeOS is ready. Start it with:  npm start\nThen open http://localhost:3000 (or http://<your-mac-name>.local:3000 on the iPad).");
