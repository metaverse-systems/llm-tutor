import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const LAUNCHER_PATH = "../electron-launcher.cjs";

declare global {
  // eslint-disable-next-line no-var
  var __LLM_TUTOR_ELECTRON_LAUNCHER__:
    | {
        args?: string[];
        emit?: (event: string, payload?: unknown) => boolean;
      }
    | undefined;
}

const originalArgv = [...process.argv];
const originalEnv = {
  port: process.env.ELECTRON_REMOTE_DEBUGGING_PORT,
  testMode: process.env.ELECTRON_LAUNCHER_TEST_MODE
};

const resetHarness = () => {
  delete global.__LLM_TUTOR_ELECTRON_LAUNCHER__;
};

const restoreEnv = () => {
  if (typeof originalEnv.port === "string") {
    process.env.ELECTRON_REMOTE_DEBUGGING_PORT = originalEnv.port;
  } else {
    delete process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
  }

  if (typeof originalEnv.testMode === "string") {
    process.env.ELECTRON_LAUNCHER_TEST_MODE = originalEnv.testMode;
  } else {
    delete process.env.ELECTRON_LAUNCHER_TEST_MODE;
  }
};

const extractPortFromArgs = (args: string[] | undefined) => {
  if (!args) return null;
  const flag = args.find((value) => value.startsWith("--remote-debugging-port"));
  if (!flag) return null;
  const [, portValue] = flag.split("=");
  return portValue ? Number.parseInt(portValue, 10) : null;
};

const waitForCondition = async (predicate: () => boolean, timeoutMs = 500) => {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("electron-launcher CLI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetHarness();
    process.argv = [
      "node",
      "electron-launcher.cjs",
      "--remote-debugging-port=0",
      "apps/desktop/dist/main.js"
    ];
    delete process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
    process.env.ELECTRON_LAUNCHER_TEST_MODE = "1";
    vi.spyOn(process, "on").mockImplementation(() => process);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    restoreEnv();
    resetHarness();
    vi.restoreAllMocks();
  });

  it("persists the dynamically allocated debugging port back into the environment", async () => {
    await import(LAUNCHER_PATH);

    await waitForCondition(() =>
      typeof process.env.ELECTRON_REMOTE_DEBUGGING_PORT === "string"
    );

    const portValue = process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
    expect(portValue).toBeDefined();
    expect(Number.parseInt(portValue ?? "", 10)).toBeGreaterThan(0);
    expect(portValue).not.toBe("9222");

    const harnessPort = extractPortFromArgs(global.__LLM_TUTOR_ELECTRON_LAUNCHER__?.args);
    expect(harnessPort).toBe(Number.parseInt(portValue ?? "", 10));
  });

  it("logs a structured launcher failure when Electron spawn emits an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await import(LAUNCHER_PATH);

    await waitForCondition(() => Boolean(global.__LLM_TUTOR_ELECTRON_LAUNCHER__?.emit));

    const harness = global.__LLM_TUTOR_ELECTRON_LAUNCHER__;
    expect(harness?.emit).toBeDefined();

    const launcherError = new Error("test-spawn-error");
    harness?.emit?.("error", launcherError);

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Electron launcher failed"),
      expect.objectContaining({ message: "test-spawn-error" })
    );
  });
});
