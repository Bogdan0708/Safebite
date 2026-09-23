import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { assertFreshDist } from "./tooling/distStamp.ts";

// Serves the validated bundle in `dist-preview` (built by `npm run build:preview`; this config
// refuses a missing or stale dist) through `vite preview`, to test the PWA shell: manifest, icons,
// service worker, offline reload. No emulators, no network beyond 127.0.0.1.
const webRoot = path.dirname(fileURLToPath(import.meta.url));
assertFreshDist(webRoot, "dist-preview", "preview");

export default defineConfig({
  testDir: "./e2e-preview",
  outputDir: "test-results/preview",
  timeout: 30_000,
  globalTimeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run preview:pwa",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
