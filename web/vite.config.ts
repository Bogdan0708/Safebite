/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { guardViteBuild } from "./src/config/firebaseEnv.ts";

/**
 * Refuses to produce a deployable bundle with missing, blank, or demo Firebase values, and
 * refuses any non-production build (NODE_ENV overridden) before that check.
 * `SAFEBITE_UNVALIDATED_BUILD=1` skips the Firebase check for compile-only builds (CI, local
 * smoke); such bundles still refuse to start at runtime (see src/firebase.ts, keyed on the
 * `__SAFEBITE_BUILD__` marker defined below, which is independent of NODE_ENV).
 */
function requireDeployableFirebaseEnv(mode: string): Plugin {
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
      });
      if (outcome === "skipped") {
        config.logger.warn(
          "[safebite] SAFEBITE_UNVALIDATED_BUILD=1: skipping Firebase configuration validation (compile-only build)",
        );
      }
    },
  };
}

export default defineConfig(({ mode, command }) => ({
  // True in every built bundle, false for the dev server and Vitest. Unlike import.meta.env.PROD
  // it cannot be flipped by NODE_ENV, so src/firebase.ts can rely on it for the startup guard.
  define: { __SAFEBITE_BUILD__: JSON.stringify(command === "build") },
  plugins: [react(), requireDeployableFirebaseEnv(mode)],
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
}));
