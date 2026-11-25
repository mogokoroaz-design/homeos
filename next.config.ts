import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Version shown in Settings and the sidebar, so it's easy to confirm an update was applied.
function version() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const date = execSync("git log -1 --format=%cd --date=format:%Y-%m-%d", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return `${date} · ${sha}`;
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng", "sharp", "zxing-wasm"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  env: { NEXT_PUBLIC_HOMEOS_VERSION: version() },
  poweredByHeader: false,
  devIndicators: false,
};
export default nextConfig;
