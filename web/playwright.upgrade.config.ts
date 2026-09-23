import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { assertFreshDist } from "./tooling/distStamp.ts";

// Same-origin release upgrades: a switchable static server (e2e-upgrade/server.mjs) serves the
// valid v1, valid v2 and invalid compile-only builds on port 4175, so an installed worker sees
// each as an update of the previous. No emulators, no network beyond 127.0.0.1.
const webRoot = path.dirname(fileURLToPath(import.meta.url));
assertFreshDist(webRoot, "dist-preview", "preview");
assertFreshDist(webRoot, "dist-preview-v2", "preview-v2");
assertFreshDist(webRoot, "dist-boot-guard", "boot-guard");

export default defineConfig({
  testDir: "./e2e-upgrade",
  outputDir: "test-results/upgrade",
  timeout: 45_000,
  globalTimeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run serve:upgrade",
    url: "http://127.0.0.1:4175/_test/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
