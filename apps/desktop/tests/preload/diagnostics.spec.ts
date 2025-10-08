import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => {
  const listeners = new Map<string, (event: unknown, payload: unknown) => void>();

  return {
    ipcRenderer: {
      invoke: vi.fn(async (_channel: string) => undefined),
      on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, listener);
      }),
      removeListener: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        const registered = listeners.get(channel);
        if (registered === listener) {
          listeners.delete(channel);
        }
      }),
      emit(channel: string, payload: unknown) {
        const listener = listeners.get(channel);
        if (listener) {
          listener({}, payload);
        }
      }
    }
  };
});

describe("createDiagnosticsBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates renderer bridge calls to the correct IPC channels", async () => {
    const { ipcRenderer } = (await import("electron")) as unknown as {
      ipcRenderer: {
        invoke: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
        emit: (channel: string, payload: unknown) => void;
      };
    };
    const { createDiagnosticsBridge } = await import("../../src/preload/diagnostics");
    const { DIAGNOSTICS_CHANNELS } = await import("../../src/ipc/diagnostics");

    const bridge = createDiagnosticsBridge();

    await bridge.getState();
    await bridge.getProcessEvents();
    await bridge.requestSummary();
    await bridge.refreshSnapshot();
    await bridge.openLogDirectory();
    await bridge.exportSnapshot();

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, DIAGNOSTICS_CHANNELS.getState);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, DIAGNOSTICS_CHANNELS.getProcessEvents);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, DIAGNOSTICS_CHANNELS.getSummary);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, DIAGNOSTICS_CHANNELS.refresh);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, DIAGNOSTICS_CHANNELS.openLogDirectory);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(6, DIAGNOSTICS_CHANNELS.exportSnapshot);
  });

  it("wires subscription handlers and supports disposal", async () => {
    const { ipcRenderer } = (await import("electron")) as unknown as {
      ipcRenderer: {
        invoke: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        removeListener: ReturnType<typeof vi.fn>;
        emit: (channel: string, payload: unknown) => void;
      };
    };
    const { createDiagnosticsBridge } = await import("../../src/preload/diagnostics");
    const { DIAGNOSTICS_CHANNELS } = await import("../../src/ipc/diagnostics");

    const backendListener = vi.fn();
    const processListener = vi.fn();

    const bridge = createDiagnosticsBridge();

    const disposeBackend = bridge.onBackendStateChanged(backendListener);
    const disposeProcess = bridge.onProcessEvent(processListener);

    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.backendStateChanged, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.processEvent, expect.any(Function));

    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.backendStateChanged, { status: "running" });
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.processEvent, { id: "1" });

    expect(backendListener).toHaveBeenCalledWith({ status: "running" });
    expect(processListener).toHaveBeenCalledWith({ id: "1" });

    disposeBackend();
    disposeProcess();

    const backendHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.backendStateChanged)?.[1];
    const processHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.processEvent)?.[1];

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.backendStateChanged, backendHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.processEvent, processHandler);
  });
});
