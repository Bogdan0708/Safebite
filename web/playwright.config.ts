import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // React 19 StrictMode (main.tsx) double-invokes SettingsPage's effect in dev mode, firing
  // two concurrent `whoami` calls on first mount. The Functions emulator can route the second,
  // concurrent call to a fresh instance that cold-starts even after the global warm-up below
  // has warmed the first instance (observed ~14s vs. the default 5s assertion timeout). Raise
  // the expect timeout rather than touching the assertions themselves.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
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
