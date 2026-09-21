/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { assertDeployableFirebaseEnv } from "./src/config/firebaseEnv.ts";

/**
 * Refuses to produce a deployable bundle with missing, blank, or demo Firebase values.
 * `SAFEBITE_UNVALIDATED_BUILD=1` skips the check for compile-only builds (CI, local smoke);
 * such bundles still refuse to start at runtime (see src/firebase.ts).
 */
function requireDeployableFirebaseEnv(mode: string): Plugin {
  return {
    name: "safebite-require-deployable-firebase-env",
    apply: "build",
    configResolved(config) {
      if (process.env.SAFEBITE_UNVALIDATED_BUILD === "1") {
        config.logger.warn(
          "[safebite] SAFEBITE_UNVALIDATED_BUILD=1: skipping Firebase configuration validation (compile-only build)",
        );
        return;
      }
      assertDeployableFirebaseEnv(config.env, `vite build --mode ${mode}`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), requireDeployableFirebaseEnv(mode)],
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
}));
