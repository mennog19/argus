import { defineConfig } from "vitest/config";

// Separate from the unit tests' config: these launch the built app, so they
// are slow, need a build first, and must never run in parallel with
// themselves. `pnpm test` doesn't pick them up.
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    // One journey, each step picking up where the last left the app.
    sequence: { concurrent: false },
    bail: 1,
    testTimeout: 90_000,
    hookTimeout: 180_000,
  },
});
