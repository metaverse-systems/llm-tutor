#!/usr/bin/env node
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const playwrightSpecDefault = "tests/e2e/diagnostics/export.spec.ts";
const electronLauncherPath = path.join(repoRoot, "tests/e2e/tools/electron-launcher.cjs");

const DEFAULT_ENV = {
  PLAYWRIGHT_HEADLESS: "1",
  PLAYWRIGHT_OFFLINE: "1"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePort = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      server.close(() => reject(error));
    });
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        const { port } = address;
        server.close(() => resolve(port));
        return;
      }
      server.close(() => reject(new Error("Unable to determine listening address")));
    });
  });
}

async function allocatePortWithRetries(maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await findAvailablePort();
    } catch (error) {
      lastError = error;
      await sleep(25);
    }
  }
  throw lastError ?? new Error("Failed to allocate remote debugging port");
}

async function resolveRemoteDebugPort(preferredValue) {
  const preferred = parsePort(preferredValue ?? process.env.LLM_TUTOR_REMOTE_DEBUG_PORT);
  if (preferred) {
    return preferred;
  }
  return await allocatePortWithRetries();
}

async function runAutomation(options = {}) {
  const {
    env: envOverrides = {},
    args = [],
    dryRun = Boolean(process.env.VITEST),
    cwd = repoRoot
  } = options;

  const resolvedPort = await resolveRemoteDebugPort(envOverrides.LLM_TUTOR_REMOTE_DEBUG_PORT);
  const launcherAwareEnv = {
    ...DEFAULT_ENV,
    LLM_TUTOR_REMOTE_DEBUG_PORT: String(resolvedPort),
    ELECTRON_LAUNCHER_PATH: electronLauncherPath,
    ...envOverrides
  };

  const finalEnv = {
    ...process.env,
    ...launcherAwareEnv
  };

  if (dryRun) {
    return { exitCode: 0, env: launcherAwareEnv, command: null };
  }

  const specArgs = args.length > 0 ? args : [playwrightSpecDefault];
  const child = spawn("npx", ["playwright", "test", ...specArgs], {
    cwd,
    env: finalEnv,
    stdio: "inherit"
  });

  return await new Promise((resolve) => {
    child.on("error", (error) => {
      console.error("[export-automation] Failed to start Playwright", error);
      resolve({ exitCode: 1, env: launcherAwareEnv, command: specArgs });
    });

    child.on("exit", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
      resolve({ exitCode, env: launcherAwareEnv, command: specArgs });
    });
  });
}

module.exports = { runAutomation };

if (require.main === module) {
  runAutomation({ dryRun: false, args: process.argv.slice(2) })
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error("[export-automation] Unexpected failure", error);
      process.exit(1);
    });
}
