#!/usr/bin/env node
const { spawn } = require("node:child_process");
const net = require("node:net");
const electron = require("electron");

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

async function mapRemoteDebuggingPort(args) {
  const result = [...args];
  for (let index = 0; index < result.length; index += 1) {
    const arg = result[index];
    if (arg.startsWith("--remote-debugging-port")) {
      const [flag, value] = arg.split("=");
      if (value === undefined) {
        const next = result[index + 1];
        if (next === "0") {
          const port = await getAvailablePort();
          result[index + 1] = String(port);
        }
      } else if (value === "0") {
        const port = await getAvailablePort();
        result[index] = `${flag}=${port}`;
      }
      break;
    }
  }
  return result;
}

async function main() {
  const normalizedArgs = await mapRemoteDebuggingPort(process.argv.slice(2));

  if (process.env.DEBUG_ELECTRON_LAUNCH === "1") {
    console.error("Electron launcher args:", JSON.stringify(normalizedArgs));
  }

  const child = spawn(electron, normalizedArgs, {
    stdio: "inherit",
    env: process.env
  });

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
    console.error("Failed to launch Electron:", error);
    process.exitCode = 1;
  });

  const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
