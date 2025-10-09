#!/usr/bin/env node
/*
 * Workspace CSS/SCSS formatter helper.
 *
 * Accepts a list of directories or globs as positional arguments and optional
 * Prettier flags (e.g., --check). Delegates to the shared Prettier config while
 * ensuring we only target CSS/SCSS files.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function partitionArgs(argv) {
  const flags = [];
  const paths = [];

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
      paths.push(value);
    }
  }

  return { flags, paths };
}

const { flags, paths } = partitionArgs(process.argv.slice(2));
const hasCheck = flags.includes("--check");
const filteredFlags = flags.filter((flag) => !["--check", "--write"].includes(flag));
const prettierConfigPath = path.resolve(__dirname, "..", "prettier.config.cjs");
const prettierIgnorePath = path.resolve(__dirname, "..", ".prettierignore");

const targets = paths.length > 0 ? paths : ["src", "tests", "styles"]; // fallback directories

const toGlob = (target) => {
  if (target.includes("*") || target.endsWith(".css") || target.endsWith(".scss")) {
    return target;
  }

  return `${target.replace(/\/$/, "")}/**/*.{css,scss}`;
};

const prettierArgs = [
  "--config",
  prettierConfigPath,
  "--ignore-path",
  prettierIgnorePath,
  "--cache",
  "--no-error-on-unmatched-pattern",
  hasCheck ? "--check" : "--write",
  ...filteredFlags,
  ...targets.map(toGlob)
];

const result = spawnSync("prettier", prettierArgs, {
  stdio: "inherit",
  env: process.env,
  shell: false
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
