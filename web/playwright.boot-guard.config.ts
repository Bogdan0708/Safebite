import { defineConfig, devices } from "@playwright/test";

// Boots the compile-only bundle in `dist-boot-guard` (built by `npm run e2e:boot-guard`) through
// `vite preview` and checks that the startup guard refuses demo Firebase values. No emulators.
export default defineConfig({
  testDir: "./e2e-boot-guard",
  outputDir: "test-results/boot-guard",
  timeout: 30_000,
  globalTimeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run preview:boot-guard",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
