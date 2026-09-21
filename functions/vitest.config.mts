import { defineConfig } from "vitest/config";

// The first callable invocation against the emulator pays a cold-require cost. On the hosted
// CI runner that can approach a minute; on a local Linux checkout it is a few seconds.
const slowTimeoutMs = process.env.CI ? 60_000 : 20_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: slowTimeoutMs,
    hookTimeout: slowTimeoutMs,
    fileParallelism: false,
  },
});
