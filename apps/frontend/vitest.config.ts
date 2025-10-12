import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/unit/**/*.spec.{ts,tsx}",
      "tests/hooks/**/*.test.{ts,tsx}",
      "tests/hooks/**/*.spec.{ts,tsx}",
      "tests/components/**/*.test.{ts,tsx}",
      "tests/components/**/*.spec.{ts,tsx}",
      "tests/pages/**/*.test.{ts,tsx}",
      "tests/pages/**/*.spec.{ts,tsx}"
    ],
    exclude: [
      "tests/pages/**/*.spec.{ts,tsx}" // Playwright e2e coverage lives in Playwright runner
    ],
    css: true
  }
});
