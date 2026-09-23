import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Caps global setup (the emulator warm-up) plus the whole suite run — 29 scenarios, one CI retry each; scenario 6 alone waits ~25 s for the client timeout.
  globalTimeout: 900_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Pixel 7 is a Chromium mobile profile; only Chromium is installed in this plan.
  // Real iPhone/Safari behaviour is checked manually in the acceptance pass (Plan 5).
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
