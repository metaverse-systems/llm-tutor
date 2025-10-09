#!/usr/bin/env node
/*
 * Root CSS/SCSS formatter orchestrator.
 *
 * Delegates to workspace-level formatters and falls back to formatting
 * repository-level styling assets using the shared Prettier configuration.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 0;
}

function partitionArgs(argv) {
  const flags = [];
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--") {
      continue;
    }

    if (value.startsWith("--")) {
      flags.push(value);

      if (!value.includes("=") && index + 1 < argv.length) {
        const next = argv[index + 1];
        if (!next.startsWith("--")) {
          flags.push(next);
          index += 1;
        }
      }
    } else {
      positional.push(value);
    }
  }

  return { flags, positional };
}

const { flags, positional } = partitionArgs(process.argv.slice(2));
const hasCheck = flags.includes("--check");
const filteredFlags = flags.filter((flag) => flag !== "--check" && flag !== "--write");
const prettierConfigPath = path.resolve(__dirname, "..", "prettier.config.cjs");
const prettierIgnorePath = path.resolve(__dirname, "..", ".prettierignore");
const prettierCommandArgsBase = [
  "--config",
  prettierConfigPath,
  "--ignore-path",
  prettierIgnorePath,
  "--cache",
  "--no-error-on-unmatched-pattern",
  hasCheck ? "--check" : "--write",
  ...filteredFlags
];

const runPrettier = (targets) => {
  if (targets.length === 0) {
    return;
  }

  run("prettier", [...prettierCommandArgsBase, ...targets]);
};

if (positional.length > 0) {
  runPrettier(positional);
  process.exit(0);
}

run("npm", [
  "run",
  "--workspaces",
  "--if-present",
  "format:css",
  "--",
  ...flags
]);

const rootTargets = [
  "*.css",
  "*.scss",
  "docs/**/*.{css,scss}"
];

runPrettier(rootTargets);
