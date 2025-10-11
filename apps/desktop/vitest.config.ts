import { defineConfig } from "vitest/config";

const SHARED_INCLUDE = [
  "src/**/*.test.ts",
  "src/**/*.spec.ts",
  "tests/**/*.test.ts",
  "tests/**/*.spec.ts",
];

const CONTRACT_INCLUDE = ["tests/contract/**/*.test.ts", "tests/contract/**/*.spec.ts"];
const INTEGRATION_INCLUDE = [
  "tests/integration/**/*.test.ts",
  "tests/integration/**/*.spec.ts",
];

export const profileIpcSuites = {
  contract: {
    name: "profile-ipc:contract",
    include: CONTRACT_INCLUDE,
    environment: "node",
  },
  integration: {
    name: "profile-ipc:integration",
    include: INTEGRATION_INCLUDE,
    environment: "node",
  },
} as const;

const EXCLUDE = [
  "tests/main/high-contrast.theme.spec.ts",
  "tests/e2e/**",
  "tests/accessibility/**",
];

export default defineConfig({
  test: {
    environment: "node",
    include: SHARED_INCLUDE,
    exclude: EXCLUDE,
  },
});
