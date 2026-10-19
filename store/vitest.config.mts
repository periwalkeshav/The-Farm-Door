import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/support/setup.ts"],
    globalSetup: ["./tests/support/global-setup.ts"],
    // Database tests share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
