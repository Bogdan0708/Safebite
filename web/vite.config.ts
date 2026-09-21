/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { guardViteBuild, validateFirebaseEnv } from "./src/config/firebaseEnv.ts";

/**
 * Refuses to produce a deployable bundle with missing, blank, or demo Firebase values, and
 * refuses any non-production build (NODE_ENV overridden) before that check.
 * `SAFEBITE_UNVALIDATED_BUILD=1` skips the Firebase check for compile-only builds (CI, local
 * smoke); such bundles still refuse to start at runtime (see src/firebase.ts, keyed on the
 * `__SAFEBITE_BUILD__` marker defined below, which is independent of NODE_ENV).
 */
function requireDeployableFirebaseEnv(mode: string, expectedDeployable: boolean): Plugin {
  return {
    name: "safebite-require-deployable-firebase-env",
    apply: "build",
    configResolved(config) {
      const outcome = guardViteBuild({
        isProduction: config.isProduction,
        nodeEnv: process.env.NODE_ENV,
        unvalidated: process.env.SAFEBITE_UNVALIDATED_BUILD === "1",
        env: config.env,
        context: `vite build --mode ${mode}`,
        expectedDeployable,
      });
      if (outcome === "skipped") {
        config.logger.warn(
          "[safebite] SAFEBITE_UNVALIDATED_BUILD=1: skipping Firebase configuration validation (compile-only build)",
        );
      }
    },
  };
}

// The manifest and Workbox service worker are generated at build time only (devOptions stay
// disabled: the dev server and the emulator-backed browser tests run without a worker).
// injectRegister: null — registration is done by src/main.tsx, and only when the bundle's
// Firebase configuration passed startupProblems(); see src/pwa/serviceWorker.ts. Non-deployable
// builds swap in a self-destroying worker (see below).
const pwaOptions: Parameters<typeof VitePWA>[0] = {
  registerType: "autoUpdate",
  injectRegister: null,
  manifest: {
    name: "SafeBite",
    short_name: "SafeBite",
    description: "Private gluten-free restaurant research for our household.",
    lang: "en-GB",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f7a4d",
    icons: [
      { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
      { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
    navigateFallback: "/index.html",
    // Firebase Hosting reserves /__/ (auth handler, init.js); never answer those with the shell.
    navigateFallbackDenylist: [/^\/__\//],
    // Only removes caches left by a previous Workbox major version; it does not evict a prior
    // release's precache entries on their own. That eviction is the precache controller's job on
    // activate (proven by the valid→valid upgrade test in e2e-upgrade, not by this option).
    cleanupOutdatedCaches: true,
  },
};

export default defineConfig(({ mode, command }) => {
  // The same validator the app uses at startup decides, at build time, which worker to emit.
  // A compile-only build carrying non-deployable values (SAFEBITE_UNVALIDATED_BUILD=1) gets the
  // plugin's self-destroying worker: it precaches nothing and, if an installed valid worker ever
  // picks it up as an update, it unregisters itself, navigates open pages and deletes every cache.
  // That cache purge is best-effort (the plugin does not run it inside a `waitUntil`, so it can be
  // cut short); the authoritative purge is `purgeServiceWorkerState()` in src/main.tsx, run by the
  // misconfigured page itself while it is still reachable. Deployable builds get the normal
  // precaching worker. (guardViteBuild, below in the plugin chain, still refuses non-production
  // builds and un-bypassed invalid ones, and now also refuses if `deployable` here disagrees with
  // its own resolved env — see firebaseEnv.ts's `expectedDeployable`.)
  const firebaseEnv = loadEnv(mode, process.cwd(), "VITE_");
  const deployable = validateFirebaseEnv(firebaseEnv).length === 0;
  return {
    // True in every built bundle, false for the dev server and Vitest. Unlike import.meta.env.PROD
    // it cannot be flipped by NODE_ENV, so src/firebase.ts can rely on it for the startup guard.
    define: { __SAFEBITE_BUILD__: JSON.stringify(command === "build") },
    plugins: [
      react(),
      requireDeployableFirebaseEnv(mode, deployable),
      VitePWA({ ...pwaOptions, selfDestroying: command === "build" && !deployable }),
    ],
    server: { port: 5173, strictPort: true },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test-setup.ts"],
    },
  };
});
