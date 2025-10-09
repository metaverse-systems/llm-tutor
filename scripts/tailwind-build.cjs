#!/usr/bin/env node
/*
 * Root Tailwind build orchestrator.
 *
 * Executes each workspace Tailwind build script sequentially so that CI and
 * local quality gates can verify generated utilities compile without errors.
 */

const { spawnSync } = require("node:child_process");

const sharedWorkspace = "@metaverse-systems/llm-tutor-shared";

const workspaces = [
  "@metaverse-systems/llm-tutor-frontend",
  "@metaverse-systems/llm-tutor-desktop",
  "@metaverse-systems/llm-tutor-backend",
  sharedWorkspace
];

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");

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

// Ensure shared theme assets are generated before consumer Tailwind builds run.
run("npm", [
  "run",
  "--workspace",
  sharedWorkspace,
  "build"
]);

run("npm", [
  "run",
  "--workspace",
  sharedWorkspace,
  "--if-present",
  "build:tokens"
]);

for (const workspace of workspaces) {
  const args = [
    "run",
    "--workspace",
    workspace,
    "--if-present",
    "tailwind:build"
  ];

  if (forwardedArgs.length > 0) {
    args.push("--", ...forwardedArgs);
  }

  run("npm", args);
}
