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

const lintArgs = ["run", "--workspaces", "--if-present", "lint"];
if (forwardedArgs.length > 0) {
  lintArgs.push(...forwardedArgs);
}

run("npm", lintArgs);

if (skipEnforcement) {
  process.exit(0);
}

run("npm", ["run", "format:css", "--", "--check"]);
run("npm", ["run", "tailwind:build", "--", "--ci"]);
