import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const LAUNCHER_PATH = "../electron-launcher.cjs";

const originalArgv = [...process.argv];
const originalEnvPort = process.env.ELECTRON_REMOTE_DEBUGGING_PORT;

const restoreEnvPort = () => {
  if (typeof originalEnvPort === "string") {
    process.env.ELECTRON_REMOTE_DEBUGGING_PORT = originalEnvPort;
  } else {
    delete process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
  }
};

describe("electron-launcher CLI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.argv = [
      "node",
      "electron-launcher.cjs",
      "--remote-debugging-port=0",
      "apps/desktop/dist/main.js"
    ];
    delete process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    restoreEnvPort();
    vi.restoreAllMocks();
    vi.doUnmock("electron");
    vi.doUnmock("node:net");
    vi.doUnmock("node:child_process");
  });

  it("persists the dynamically allocated debugging port back into the environment", async () => {
    const assignedPort = 45977;
    vi.doMock("electron", () => "electron-binary");
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => ({
        on: vi.fn(),
        kill: vi.fn(),
        killed: false
      }))
    }));
    vi.doMock("node:net", () => ({
      createServer: () => ({
        unref: vi.fn(),
        on: vi.fn(),
        listen: vi.fn((_: unknown, ready: () => void) => ready()),
        address: vi.fn(() => ({ port: assignedPort })),
        close: vi.fn((done?: () => void) => done?.())
      })
    }));

    vi.spyOn(process, "on").mockImplementation(() => process);

    await import(LAUNCHER_PATH);

    expect(process.env.ELECTRON_REMOTE_DEBUGGING_PORT).toBe(String(assignedPort));
  });

  it("logs a structured launcher failure when Electron spawn emits an error", async () => {
    const launcherError = new Error("test-spawn-error");
    vi.doMock("electron", () => "electron-binary");

    const childHandlers = new Map<string, (payload: unknown) => void>();
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => ({
        on: vi.fn((event: string, handler: (payload: unknown) => void) => {
          childHandlers.set(event, handler);
        }),
        kill: vi.fn(),
        killed: false
      }))
    }));

    vi.doMock("node:net", () => ({
      createServer: () => ({
        unref: vi.fn(),
        on: vi.fn(),
        listen: vi.fn((_: unknown, ready: () => void) => ready()),
        address: vi.fn(() => ({ port: 45001 })),
        close: vi.fn((done?: () => void) => done?.())
      })
    }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "on").mockImplementation(() => process);

    await import(LAUNCHER_PATH);

    const errorHandler = childHandlers.get("error");
    expect(errorHandler).toBeDefined();
    errorHandler?.(launcherError);

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Electron launcher failed"),
      expect.objectContaining({ message: "test-spawn-error" })
    );
  });
});
