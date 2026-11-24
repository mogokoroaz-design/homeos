import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build with an isolated data directory.
const env = { DATABASE_URL: "file:../data/e2e/e2e.db", HOMEOS_DATA_DIR: "./data/e2e", PORT: "3100" };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Shared-iPad layout & touch (Chromium engine; also verify on the real iPad in Safari).
    { name: "ipad", use: { ...devices["iPad Pro 11 landscape"], browserName: "chromium", defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "rm -rf data/e2e && mkdir -p data/e2e && npx prisma migrate deploy && npx next start -p 3100",
    url: "http://localhost:3100/setup",
    timeout: 120_000,
    reuseExistingServer: false,
    env,
  },
});
