#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

const DEFAULT_LOCK_FILENAME = ".llm-tutor-dev-backend.lock";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4319;
const BACKEND_WORKSPACE = "@metaverse-systems/llm-tutor-backend";

const lockEnv = (process.env.LLM_TUTOR_DEV_BACKEND_LOCK ?? "").trim();
const diagnosticsHost = (process.env.DIAGNOSTICS_HOST ?? DEFAULT_HOST).trim() || DEFAULT_HOST;
const parsedPort = Number.parseInt(process.env.DIAGNOSTICS_PORT ?? "", 10);
const diagnosticsPort = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
const lockPath = path.resolve(process.cwd(), lockEnv.length > 0 ? lockEnv : DEFAULT_LOCK_FILENAME);

let childProcess = null;
let isShuttingDown = false;

function log(message) {
  console.log(`[diagnostics] ${message}`);
}

function warn(message, error) {
  if (error) {
    console.warn(`[diagnostics] ${message}`, error);
  } else {
    console.warn(`[diagnostics] ${message}`);
  }
}

function ensureDirectoryExists(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    if (error && error.code !== "EEXIST") {
      throw error;
    }
  }
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== "number") {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
      return true;
    }
    return false;
  }
}

function readLock() {
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  try {
    const contents = fs.readFileSync(lockPath, "utf-8");
    return JSON.parse(contents);
  } catch (error) {
    warn("Unable to read diagnostics backend lock; treating as stale.", error);
    return null;
  }
}

function writeLock(payload) {
  try {
    ensureDirectoryExists(path.dirname(lockPath));
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    warn("Failed to write diagnostics backend lock", error);
  }
}

function removeLock() {
  if (!fs.existsSync(lockPath)) {
    return;
  }
  try {
    const payload = readLock();
    if (payload && payload.ownerPid && payload.ownerPid !== process.pid) {
      return;
    }
    fs.rmSync(lockPath, { force: true });
  } catch (error) {
    warn("Failed to remove diagnostics backend lock", error);
  }
}

function terminateWithConflict(message) {
  warn(message);
  process.exitCode = 1;
  process.exit();
}

function probePort(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      finish(true);
    });

    socket.once("error", (error) => {
      socket.destroy();
      if (error && (error.code === "ECONNREFUSED" || error.code === "ENOENT")) {
        finish(false);
        return;
      }
      warn(`Backend port probe produced ${error?.code ?? error?.message ?? error}`);
      finish(false);
    });

    socket.setTimeout(500, () => {
      socket.destroy();
      finish(true);
    });
  });
}

async function ensureBackendAvailable() {
  const existingLock = readLock();
  if (existingLock) {
    const ownerAlive = isProcessAlive(existingLock.ownerPid);
    const childAlive = isProcessAlive(existingLock.childPid);
    if (ownerAlive || childAlive) {
      terminateWithConflict(
        `Backend lock already held by PID ${existingLock.ownerPid}${
          existingLock.childPid ? ` (child ${existingLock.childPid})` : ""
        }. Stop the other session or remove ${lockPath}.`
      );
      return false;
    }
    warn("Found stale diagnostics backend lock; removing.");
    removeLock();
  }

  const busy = await probePort(diagnosticsHost, diagnosticsPort);
  if (busy) {
    terminateWithConflict(
      `Diagnostics backend already listening on ${diagnosticsHost}:${diagnosticsPort}. Stop the existing server before starting a new dev harness.`
    );
    return false;
  }

  return true;
}

function setupSignalHandlers() {
  const cleanup = () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    if (childProcess && !childProcess.killed) {
      childProcess.kill("SIGINT");
    }
    removeLock();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (error) => {
    warn("Dev backend manager encountered an uncaught exception", error);
    cleanup();
    process.exit(1);
  });
}

async function start() {
  const available = await ensureBackendAvailable();
  if (!available) {
    return;
  }

  const lockCreatedAt = new Date().toISOString();

  writeLock({
    ownerPid: process.pid,
    childPid: null,
    createdAt: lockCreatedAt
  });

  setupSignalHandlers();

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  childProcess = spawn(npmCommand, ["run", "dev", "--workspace", BACKEND_WORKSPACE], {
    stdio: "inherit",
    env: process.env
  });

  childProcess.once("spawn", () => {
    log(`Dev backend started (PID ${childProcess.pid ?? "unknown"}).`);
    writeLock({
      ownerPid: process.pid,
      childPid: childProcess.pid ?? null,
      createdAt: lockCreatedAt
    });
  });

  childProcess.on("exit", (code, signal) => {
    removeLock();
    if (signal) {
      log(`Dev backend exited due to signal ${signal}.`);
    } else {
      log(`Dev backend exited with code ${code ?? 0}.`);
    }
    childProcess = null;
    process.exit(code ?? 0);
  });

  childProcess.on("error", (error) => {
    removeLock();
    warn("Failed to launch backend dev process", error);
    childProcess = null;
    process.exit(1);
  });
}

start().catch((error) => {
  warn("Dev backend manager encountered an error", error);
  removeLock();
  process.exit(1);
});
