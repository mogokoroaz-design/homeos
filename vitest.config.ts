import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/empty.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: "file:../data/test/test.db", HOMEOS_DATA_DIR: path.resolve(__dirname, "data/test") },
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
