#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const net = require("node:net");
const electron = require("electron");

const isTestMode = process.env.ELECTRON_LAUNCHER_TEST_MODE === "1";
const testHarness = isTestMode ? {} : null;
const shouldLogDiagnostics = process.env.LLM_TUTOR_DIAGNOSTICS_LOG === "1";

const logDiagnosticsEvent = (event, payload) => {
  if (!shouldLogDiagnostics) {
    return;
  }
  console.error("[diagnostics-export]", event, JSON.stringify(payload));
};

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address) {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Unable to determine server address")));
      }
    });
  });
}

async function allocatePortWithRetries(maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getAvailablePort();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Failed to allocate remote debugging port");
}

const parsePort = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

async function ensureRemoteDebuggingPort(args) {
  const result = [...args];
  let allocatedPort = null;
  const preferredPort = parsePort(process.env.LLM_TUTOR_REMOTE_DEBUG_PORT);

  const resolvePort = async () => {
    if (preferredPort) {
      return preferredPort;
    }
    return await allocatePortWithRetries();
  };

  for (let index = 0; index < result.length; index += 1) {
    const arg = result[index];
    if (!arg.startsWith("--remote-debugging-port")) {
      continue;
    }

    const [flag, value] = arg.split("=");

    if (value === undefined) {
      const next = result[index + 1];
      if (next === undefined || next === "0") {
        allocatedPort = await resolvePort();
        if (next === undefined) {
          result.splice(index + 1, 0, String(allocatedPort));
        } else {
          result[index + 1] = String(allocatedPort);
        }
      } else {
        const existingPort = Number.parseInt(next, 10);
        allocatedPort = Number.isFinite(existingPort) ? existingPort : null;
      }
    } else if (value === "0") {
      allocatedPort = await resolvePort();
      result[index] = `${flag}=${allocatedPort}`;
    } else {
      allocatedPort = Number.parseInt(value, 10) || null;
    }

    return { args: result, port: allocatedPort };
  }

  allocatedPort = await resolvePort();
  result.push(`--remote-debugging-port=${allocatedPort}`);
  return { args: result, port: allocatedPort };
}

async function main() {
  const { args: normalizedArgs, port } = await ensureRemoteDebuggingPort(
    process.argv.slice(2)
  );

  if (typeof port === "number" && Number.isFinite(port)) {
    process.env.ELECTRON_REMOTE_DEBUGGING_PORT = String(port);
    logDiagnosticsEvent("remote-debugging-port", { port });
  }

  if (process.env.DEBUG_ELECTRON_LAUNCH === "1") {
    console.error("Electron launcher args:", JSON.stringify(normalizedArgs));
  }

  let child;

  if (isTestMode) {
    const emitter = new EventEmitter();
    emitter.kill = () => {};
    emitter.killed = false;
    child = emitter;
    if (testHarness) {
      testHarness.child = emitter;
      testHarness.args = normalizedArgs;
      testHarness.emit = (event, payload) => emitter.emit(event, payload);
    }
  } else {
    child = spawn(electron, normalizedArgs, {
      stdio: "inherit",
      env: process.env
    });
  }

  const forwardExit = (code, signal) => {
    if (typeof code === "number") {
      process.exitCode = code;
    }
    if (signal) {
      process.kill(process.pid, signal);
    }
  };

  child.on("exit", forwardExit);
  child.on("error", (error) => {
    console.error("Electron launcher failed", {
      message: error?.message,
      stack: error?.stack
    });
    logDiagnosticsEvent("launcher-error", { message: error?.message });
    process.exitCode = 1;
  });

  const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      if (!child.killed && typeof child.kill === "function") {
        child.kill(signal);
      }
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

if (testHarness) {
  global.__LLM_TUTOR_ELECTRON_LAUNCHER__ = testHarness;
}
