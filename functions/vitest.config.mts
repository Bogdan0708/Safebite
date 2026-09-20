import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The first callable invocation against the emulator pays a 10-20s cold-require
    // cost when the repo lives on a Windows-mounted path (e.g. WSL's /mnt/c), so both
    // timeouts are generous to give that cold start headroom.
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
