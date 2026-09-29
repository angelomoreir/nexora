import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    locale: "en-US",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run dev -w @nexora/api",
      cwd: "../..",
      url: "http://localhost:3000/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: "npm run dev -w @nexora/web",
      cwd: "../..",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
