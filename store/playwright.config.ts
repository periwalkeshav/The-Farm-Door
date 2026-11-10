import { defineConfig, devices } from "@playwright/test";

/**
 * Automated browser tests: a robot shops on a private copy of the store.
 *
 *   npm run test:e2e
 *
 * It wipes and seeds its own database (farmdoor_e2e), builds the site with
 * simulated payments and courier, and serves it on port 3100. Your
 * development database is never touched. Note: this replaces the .next build
 * output, so run `npm run build` again before `npm start`.
 */
const PORT = 3100;
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:54329/farmdoor_e2e";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Chrome already installed on this computer (no extra download). On CI, Playwright's own Chromium.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" }, testIgnore: /mobile\.spec\.ts/ },
    { name: "phone", use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run e2e:db && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: databaseUrl,
      APP_URL: `http://localhost:${PORT}`,
      PAYMENTS_PROVIDER: "mock",
      SHIPPING_PROVIDER: "mock",
      EMAIL_TRANSPORT: "log",
      ALLOW_MOCK_PROVIDERS: "true",
    },
  },
});
