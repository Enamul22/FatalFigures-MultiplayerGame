import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 8000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3101",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    actionTimeout: 10000,
  },
  webServer: {
    command: "node node_modules/tsx/dist/cli.mjs scripts/browser-server.ts",
    url: "http://localhost:3101/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
