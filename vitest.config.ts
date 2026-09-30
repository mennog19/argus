import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Lets the KeePass-written fixture vaults be imported with `?inline`.
  assetsInclude: ["**/*.kdbx", "**/*.keyx"],
  test: {
    environment: "jsdom",
    // Needed so @testing-library/react's auto-cleanup (which detects the
    // test framework via the global `afterEach`) unmounts between tests —
    // test files still import describe/it/expect/vi explicitly for lint.
    globals: true,
    setupFiles: ["./tests/vitest.setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/vite-env.d.ts"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
