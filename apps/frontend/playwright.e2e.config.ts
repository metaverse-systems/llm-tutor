import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: /.*\.spec\.ts/,
  testIgnore: ["**/__tests__/**"],
  reporter: [["list"], ["html", { outputFolder: "../../docs/reports/playwright" }]],
  use: {
    trace: "on-first-retry",
    baseURL: process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:4318"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
