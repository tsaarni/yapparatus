/** Playwright configuration for the browser tests, served by scripts/test-server.ts. */
import { defineConfig, devices } from "@playwright/test";

/** Runs the browser tests one at a time in Chromium against the test server. */
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/test-server.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
