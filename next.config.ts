import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  poweredByHeader: false,
  devIndicators: false,
};
export default nextConfig;
