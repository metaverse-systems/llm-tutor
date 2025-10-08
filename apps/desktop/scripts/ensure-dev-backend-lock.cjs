#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

const DEFAULT_LOCK_FILENAME = ".llm-tutor-dev-backend.lock";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4319;

const lockEnv = process.env.LLM_TUTOR_DEV_BACKEND_LOCK?.trim();
const diagnosticsHost = process.env.DIAGNOSTICS_HOST?.trim() || DEFAULT_HOST;
const diagnosticsPort = Number.parseInt(process.env.DIAGNOSTICS_PORT ?? "" + DEFAULT_PORT, 10);
const portToProbe = Number.isFinite(diagnosticsPort) ? diagnosticsPort : DEFAULT_PORT;

const lockPath = path.resolve(process.cwd(), lockEnv && lockEnv.length > 0 ? lockEnv : DEFAULT_LOCK_FILENAME);

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

function tryRemoveLockFile() {
  try {
    if (fs.existsSync(lockPath)) {
      fs.rmSync(lockPath);
      console.log(`[diagnostics] Removed stale backend lock at ${lockPath}.`);
    }
  } catch (error) {
    console.warn(`[diagnostics] Failed to remove backend lock at ${lockPath}:`, error);
  }
}

function ensureLockIsFresh() {
  if (!fs.existsSync(lockPath)) {
    return;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    const ownerAlive = isProcessAlive(payload.ownerPid);
    const childAlive = payload.childPid ? isProcessAlive(payload.childPid) : false;

    if (!ownerAlive && !childAlive) {
      tryRemoveLockFile();
      return;
    }

    console.log(
      `[diagnostics] Backend lock currently held by PID ${payload.ownerPid}${
        payload.childPid ? ` (child ${payload.childPid})` : ""
      }.`
    );
  } catch (error) {
    console.warn(`[diagnostics] Unable to read backend lock at ${lockPath}. Treating as stale.`, error);
    tryRemoveLockFile();
  }
}

function probePort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 500 }, () => {
      socket.end();
      resolve(true);
    });

    socket.on("error", (error) => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        resolve(false);
      } else {
        console.warn(`[diagnostics] Backend port probe produced ${error.code ?? error.message}`);
        resolve(false);
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

(async () => {
  ensureLockIsFresh();
  const inUse = await probePort(diagnosticsHost, portToProbe);
  if (inUse) {
    console.log(
      `[diagnostics] Detected an existing diagnostics backend listening at ${diagnosticsHost}:${portToProbe}.`
    );
  }
})().catch((error) => {
  console.warn("[diagnostics] Dev backend preflight encountered an error", error);
});
