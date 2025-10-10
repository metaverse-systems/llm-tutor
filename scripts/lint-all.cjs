#!/usr/bin/env node
/*
 * Root lint orchestrator that ensures formatting and Tailwind builds are
 * enforced locally while allowing CI to run individual steps separately.
 */

const { spawnSync } = require("node:child_process");

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const skipEnforcement = process.env.LINT_SKIP_ENFORCEMENT === "true";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runStep(label, command, args) {
  console.log(`\n→ ${label}`);
  run(command, args);
}

const lintArgs = ["run", "--workspaces", "--if-present", "lint"];
if (forwardedArgs.length > 0) {
  lintArgs.push(...forwardedArgs);
}

runStep("Workspace lint", "npm", lintArgs);

if (skipEnforcement) {
  process.exit(0);
}

runStep("CSS format check", "npm", ["run", "format:css", "--", "--check"]);

runStep("Generate theme tokens", "npm", ["run", "build:tokens"]);

runStep("Compile Tailwind layers", "npm", ["run", "tailwind:build", "--", "--ci"]);

runStep("Run shared theme unit suites", "npm", [
  "run",
  "--workspace",
  "@metaverse-systems/llm-tutor-shared",
  "test",
  "--",
  "tests/unit/theme.tokens.contract.test.ts",
  "tests/unit/theme.css.spec.ts"
]);

runStep("Run frontend high-contrast accessibility spec", "npm", [
  "run",
  "--workspace",
  "@metaverse-systems/llm-tutor-frontend",
  "test:a11y",
  "--",
  "--grep",
  "Unified theme high contrast accessibility"
]);

runStep("Run desktop high-contrast accessibility spec", "npx", [
  "playwright",
  "test",
  "apps/desktop/tests/main/high-contrast.theme.spec.ts"
]);
