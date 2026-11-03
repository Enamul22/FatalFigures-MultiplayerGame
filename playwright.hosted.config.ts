import { defineConfig } from "@playwright/test";
const url = process.env.FATAL_PUBLIC_URL;
if (!url || !/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(url))
  throw Error("Set FATAL_PUBLIC_URL to the reviewed Render HTTPS origin.");
export default defineConfig({
  testDir: "tests/hosted",
  workers: 1,
  timeout: 3600000,
  expect: { timeout: 30000 },
  reporter: "list",
  use: {
    baseURL: url,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 20000,
  },
});
