/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { guardViteBuild, validateFirebaseEnv } from "./src/config/firebaseEnv.ts";
import { fixtureMismatches, isFixtureMode, parseEnvFile } from "./src/config/fixtureEnv.ts";
import { computeSourceHash, type BuildStamp } from "./tooling/sourceHash.ts";

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

/**
 * For the three synthetic test modes, refuse the build unless every value in `web/.env.<mode>`
 * is exactly what Vite resolved. An exported VITE_* variable outranks the mode file in Vite, so
 * without this a shell could swap a real project into a "synthetic" bundle (audit F7).
 */
function requireFixtureIdentity(mode: string, resolvedEnv: Record<string, string>): Plugin {
  return {
    name: "safebite-require-fixture-identity",
    apply: "build",
    configResolved(config) {
      if (!isFixtureMode(mode)) return;
      const file = path.resolve(config.root, `.env.${mode}`);
      const fixture = parseEnvFile(readFileSync(file, "utf8"));
      const problems = fixtureMismatches(fixture, resolvedEnv);
      if (problems.length > 0) {
        throw new Error(
          `[safebite] vite build --mode ${mode} is not hermetic; refusing to build:\n- ${problems.join("\n- ")}\n` +
            `Unset the conflicting VITE_* variables (and any .env.${mode}.local) so the committed fixture is what gets built.`,
        );
      }
    },
  };
}

/**
 * Writes `<outDir>/safebite-build.json` so test scripts can verify which mode and which sources a
 * dist came from. Not matched by the Workbox glob (json is not in it), so never precached.
 */
function buildStamp(mode: string, projectId: string): Plugin {
  return {
    name: "safebite-build-stamp",
    apply: "build",
    generateBundle() {
      const stamp: BuildStamp = {
        mode,
        projectId,
        sourceHash: computeSourceHash(process.cwd(), mode),
        builtAt: new Date().toISOString(),
      };
      this.emitFile({ type: "asset", fileName: "safebite-build.json", source: JSON.stringify(stamp, null, 2) + "\n" });
    },
  };
}

// The manifest and Workbox service worker are generated at build time only (devOptions stay
// disabled: the dev server and the emulator-backed browser tests run without a worker).
// injectRegister: null — registration is done by src/main.tsx, and only when the bundle's
// Firebase configuration passed startupProblems(); see src/pwa/serviceWorker.ts. Non-deployable
// builds swap in a self-destroying worker (see below).
const pwaOptions: Parameters<typeof VitePWA>[0] = {
  // prompt: a new worker waits until a tab taps Reload (src/pwa/updates.ts). autoUpdate reloaded
  // every tab unannounced, discarding typed input (Plan 2a final review; audit F5).
  registerType: "prompt",
  injectRegister: null,
  // The glob below already matches the PNG icons; the plugin would otherwise add them a second time.
  includeManifestIcons: false,
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
    // No "webmanifest" here: the plugin adds manifest.webmanifest itself (outside the includeManifestIcons switch), so listing it too duplicated the entry (audit F6).
    globPatterns: ["**/*.{js,css,html,svg,png}"],
    navigateFallback: "/index.html",
    // Firebase Hosting reserves /__/ (auth handler, init.js); never answer those with the shell.
    navigateFallbackDenylist: [/^\/__\//],
    // Only removes caches left by a previous Workbox major version; it does not evict a prior
    // release's precache entries on their own. That eviction is the precache controller's job on
    // activate (proven by the valid→valid upgrade test in e2e-upgrade, not by this option).
    cleanupOutdatedCaches: true,
    // The plugin only defaults clientsClaim to true for registerType "autoUpdate"; prompt mode
    // needs it set explicitly so a fresh install claims the open tab without a reload, and so an
    // update — once skipWaiting is requested — claims every open tab (the onNeedReload fan-out
    // the store in src/pwa/updates.ts relies on). skipWaiting itself stays unset (false): the
    // plugin's default template then waits for the SKIP_WAITING postMessage that
    // updateServiceWorker() sends, so an update never activates until a tab taps Reload.
    clientsClaim: true,
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
      requireFixtureIdentity(mode, firebaseEnv),
      requireDeployableFirebaseEnv(mode, deployable),
      buildStamp(mode, firebaseEnv.VITE_FIREBASE_PROJECT_ID ?? ""),
      VitePWA({
        ...pwaOptions,
        selfDestroying: command === "build" && !deployable,
        // A self-destroying build must not look installable: no manifest file, no <link rel="manifest">.
        manifest: deployable ? pwaOptions.manifest : false,
      }),
    ],
    server: { port: 5173, strictPort: true },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "tooling/**/*.test.ts"],
      setupFiles: ["src/test-setup.ts"],
    },
  };
});
