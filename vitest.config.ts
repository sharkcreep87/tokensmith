import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 15_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/tests/**",
        "src/cli/index.ts",
        "src/types/**",
        "**/*.d.ts"
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50
      }
    }
  }
});
