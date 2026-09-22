import { defineConfig } from "vitest/config";

// The first callable invocation against the emulator pays a cold-require cost. On the hosted
// CI runner that can approach a minute; on a local Linux checkout it is a few seconds.
const slowTimeoutMs = process.env.CI ? 60_000 : 20_000;

// The Firestore emulator has been observed to flake under back-to-back runs ("Request time should not
// be before the last token refill time"). CI retries once to absorb that; local runs keep retries off
// so a genuine flake stays visible instead of being silently swallowed.
const retry = process.env.CI ? 1 : 0;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: slowTimeoutMs,
    hookTimeout: slowTimeoutMs,
    fileParallelism: false,
    retry,
  },
});
