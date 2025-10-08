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
    await bridge.updatePreferences({
      highContrastEnabled: true,
      reducedMotionEnabled: false,
      remoteProvidersEnabled: true,
      consentSummary: "Updated",
      expectedLastUpdatedAt: "2025-01-01T00:00:00Z"
    });

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, DIAGNOSTICS_CHANNELS.getState);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, DIAGNOSTICS_CHANNELS.getProcessEvents);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, DIAGNOSTICS_CHANNELS.getSummary);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, DIAGNOSTICS_CHANNELS.refresh);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, DIAGNOSTICS_CHANNELS.openLogDirectory);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(6, DIAGNOSTICS_CHANNELS.exportSnapshot);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(7, DIAGNOSTICS_CHANNELS.preferencesUpdate, {
      highContrastEnabled: true,
      reducedMotionEnabled: false,
      remoteProvidersEnabled: true,
      consentSummary: "Updated",
      expectedLastUpdatedAt: "2025-01-01T00:00:00Z",
      updatedBy: "renderer"
    });
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
    const warningListener = vi.fn();
    const snapshotListener = vi.fn();
    const preferencesListener = vi.fn();
    const storageListener = vi.fn();

    const bridge = createDiagnosticsBridge();

    const disposeBackend = bridge.onBackendStateChanged(backendListener);
    const disposeProcess = bridge.onProcessEvent(processListener);
    const disposeWarning = bridge.onRetentionWarning(warningListener);
    const disposeSnapshot = bridge.onSnapshotUpdated(snapshotListener);
    const disposePreferences = bridge.onPreferencesUpdated(preferencesListener);
    const disposeStorage = bridge.onStorageHealthChanged(storageListener);

    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.backendStateChanged, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.processEvent, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.retentionWarning, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.snapshotUpdated, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.preferencesUpdated, expect.any(Function));
    expect(ipcRenderer.on).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.preferencesStorageHealth, expect.any(Function));

    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.backendStateChanged, { status: "running" });
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.processEvent, { id: "1" });
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.retentionWarning, "disk");
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.snapshotUpdated, { id: "snapshot" });
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.preferencesUpdated, { id: "pref" });
    (ipcRenderer as any).emit(DIAGNOSTICS_CHANNELS.preferencesStorageHealth, { status: "degraded" });

    expect(backendListener).toHaveBeenCalledWith({ status: "running" });
    expect(processListener).toHaveBeenCalledWith({ id: "1" });
    expect(warningListener).toHaveBeenCalledWith("disk");
    expect(snapshotListener).toHaveBeenCalledWith({ id: "snapshot" });
    expect(preferencesListener).toHaveBeenCalledWith({ id: "pref" });
    expect(storageListener).toHaveBeenCalledWith({ status: "degraded" });

    disposeBackend();
    disposeProcess();
    disposeWarning();
    disposeSnapshot();
    disposePreferences();
    disposeStorage();

    const backendHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.backendStateChanged)?.[1];
    const processHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.processEvent)?.[1];
    const warningHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.retentionWarning)?.[1];
    const snapshotHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.snapshotUpdated)?.[1];
    const preferencesHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.preferencesUpdated)?.[1];
    const storageHandler = (ipcRenderer.on as any).mock.calls.find(([channel]: [string]) => channel === DIAGNOSTICS_CHANNELS.preferencesStorageHealth)?.[1];

    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.backendStateChanged, backendHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.processEvent, processHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.retentionWarning, warningHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.snapshotUpdated, snapshotHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.preferencesUpdated, preferencesHandler);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(DIAGNOSTICS_CHANNELS.preferencesStorageHealth, storageHandler);
  });
});
