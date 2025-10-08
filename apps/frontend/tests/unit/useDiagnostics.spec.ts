import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDiagnosticsSnapshot,
  buildProcessHealthEvent,
  createDiagnosticsSnapshotPayload,
  createProcessHealthEventPayload
} from "@metaverse-systems/llm-tutor-shared";
import type {
  DiagnosticsSnapshotPayload,
  ProcessHealthEventPayload,
  DiagnosticsPreferenceRecordPayload,
  StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";
import { useDiagnostics } from "../../src/hooks/useDiagnostics";

type ListenerMap = {
  backend?: (payload: unknown) => void;
  processEvent?: (payload: ProcessHealthEventPayload) => void;
  retentionWarning?: (payload: string) => void;
  snapshotUpdated?: (payload: DiagnosticsSnapshotPayload | null) => void;
  preferencesUpdated?: (payload: DiagnosticsPreferenceRecordPayload) => void;
  storageHealth?: (payload: StorageHealthAlertPayload | null) => void;
};

function createDiagnosticsBridgeHarness() {
  const listeners: ListenerMap = {};
  const snapshot = createDiagnosticsSnapshotPayload(
    buildDiagnosticsSnapshot({
      warnings: ["snapshot-warning"],
      diskUsageBytes: 16_384
    })
  );

  const backend = {
    status: "running" as const,
    message: "Online",
    pid: 42,
    lastExitCode: null,
    lastExitSignal: null,
    updatedAt: new Date().toISOString()
  };

  const preferenceRecord: DiagnosticsPreferenceRecordPayload = {
    id: "9cf0b9c2-c9a0-4c30-8da5-2ca6f1f6ec09",
    highContrastEnabled: false,
    reducedMotionEnabled: false,
    remoteProvidersEnabled: false,
    lastUpdatedAt: new Date().toISOString(),
    updatedBy: "main",
    consentSummary: "Defaults applied",
    consentEvents: [],
    storageHealth: null
  };

  const getState = vi.fn().mockResolvedValue({
    backend,
    warnings: ["initial-warning"],
    latestSnapshot: snapshot,
    processEvents: [] satisfies ProcessHealthEventPayload[]
  });

  const getPreferences = vi.fn().mockResolvedValue(preferenceRecord);

  const getProcessEvents = vi.fn().mockResolvedValue([] as ProcessHealthEventPayload[]);
  const requestSummary = vi.fn().mockResolvedValue(snapshot);
  const refreshSnapshot = vi.fn().mockResolvedValue({ success: true, snapshot });
  const openLogDirectory = vi.fn().mockResolvedValue(true);
  const exportSnapshot = vi.fn().mockResolvedValue({ success: true, filename: "snapshot.jsonl" });

  const updatePreferences = vi.fn(async (payload: {
    highContrastEnabled: boolean;
    reducedMotionEnabled: boolean;
    remoteProvidersEnabled: boolean;
    consentSummary: string;
    expectedLastUpdatedAt?: string;
  }) => {
    preferenceRecord.highContrastEnabled = payload.highContrastEnabled;
    preferenceRecord.reducedMotionEnabled = payload.reducedMotionEnabled;
    preferenceRecord.remoteProvidersEnabled = payload.remoteProvidersEnabled;
    preferenceRecord.consentSummary = payload.consentSummary;
    preferenceRecord.lastUpdatedAt = new Date(Date.now() + 1000).toISOString();
    preferenceRecord.updatedBy = "renderer";
    listeners.preferencesUpdated?.(preferenceRecord);
    return {
      record: preferenceRecord,
      storageHealth: preferenceRecord.storageHealth
    };
  });

  const registerListener = <T extends keyof ListenerMap>(key: T) =>
    vi.fn((listener: ListenerMap[T]) => {
      listeners[key] = listener as ListenerMap[T];
      return () => {
        if (listeners[key] === listener) {
          listeners[key] = undefined;
        }
      };
    });

  const bridge = {
    getState,
    getPreferences,
    getProcessEvents,
    requestSummary,
    refreshSnapshot,
    openLogDirectory,
    exportSnapshot,
    updatePreferences,
    onBackendStateChanged: registerListener("backend"),
    onProcessEvent: registerListener("processEvent"),
    onRetentionWarning: registerListener("retentionWarning"),
    onSnapshotUpdated: registerListener("snapshotUpdated"),
    onPreferencesUpdated: registerListener("preferencesUpdated"),
    onStorageHealthChanged: registerListener("storageHealth")
  };

  return { bridge, listeners, snapshot, backend, preferenceRecord };
}

describe("useDiagnostics", () => {
  let harness: ReturnType<typeof createDiagnosticsBridgeHarness>;
  const globalWindow = globalThis.window as typeof globalThis.window & {
    llmTutor?: {
      diagnostics: ReturnType<typeof createDiagnosticsBridgeHarness>["bridge"];
    };
  };

  beforeEach(() => {
    harness = createDiagnosticsBridgeHarness();
    globalWindow.llmTutor = {
      diagnostics: harness.bridge
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (globalWindow.llmTutor) {
      delete globalWindow.llmTutor;
    }
  });

  it("loads initial state, merges warnings, and requests a snapshot", async () => {
    const { result } = renderHook(() => useDiagnostics({ pollIntervalMs: 60_000 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(harness.bridge.getState).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(harness.bridge.requestSummary).toHaveBeenCalledTimes(1));

    expect(result.current.backend?.status).toBe("running");
    expect(result.current.snapshot?.id).toBe(harness.snapshot.id);
    expect(result.current.warnings).toEqual([
      "initial-warning",
      "snapshot-warning"
    ]);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date);
  });

  it("marks the hook offline and surfaces an error when refresh fails", async () => {
    const { result } = renderHook(() => useDiagnostics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const failure = new Error("backend offline");
    harness.bridge.refreshSnapshot.mockRejectedValueOnce(failure);

    await act(async () => {
      const outcome = await result.current.refresh();
      expect(outcome).toBeNull();
    });

    await waitFor(() => expect(result.current.isOffline).toBe(true));
    expect(result.current.error).toBe("backend offline");
  });

  it("normalizes process events and warning updates from bridge listeners", async () => {
    const { result } = renderHook(() => useDiagnostics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const olderEvent = createProcessHealthEventPayload(
      buildProcessHealthEvent({
        occurredAt: new Date("2025-01-01T00:00:00Z"),
        reason: "Old event"
      })
    );
    const newerEvent = createProcessHealthEventPayload(
      buildProcessHealthEvent({
        occurredAt: new Date("2025-02-01T12:30:00Z"),
        reason: "New event"
      })
    );

    await act(async () => {
      harness.listeners.processEvent?.(olderEvent);
      harness.listeners.processEvent?.(newerEvent);
      harness.listeners.retentionWarning?.("disk approaching limit");
      harness.listeners.snapshotUpdated?.(harness.snapshot);
    });

    expect(result.current.processEvents).toHaveLength(2);
    expect(result.current.processEvents[0]?.id).toBe(newerEvent.id);
    expect(result.current.warnings).toContain("disk approaching limit");

    const extraEvents: ProcessHealthEventPayload[] = Array.from({ length: 40 }, (_, index) =>
      createProcessHealthEventPayload(
        buildProcessHealthEvent({
          occurredAt: new Date(Date.now() + index * 1_000)
        })
      )
    );

    await act(async () => {
      for (const event of extraEvents) {
        harness.listeners.processEvent?.(event);
      }
    });

    expect(result.current.processEvents).toHaveLength(25);
    expect(result.current.processEvents[0]?.id).toBe(extraEvents.at(-1)?.id);
  });

  it("loads persisted preferences and responds to preference broadcasts", async () => {
    const { result } = renderHook(() => useDiagnostics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const state = result.current as unknown as {
      preferences: DiagnosticsPreferenceRecordPayload | null;
    };

    expect(state.preferences?.highContrastEnabled).toBe(false);

    harness.listeners.preferencesUpdated?.({
      ...harness.preferenceRecord,
      highContrastEnabled: true,
      remoteProvidersEnabled: true,
      lastUpdatedAt: new Date(Date.now() + 2000).toISOString()
    });

    await waitFor(() => {
      const latest = (result.current as unknown as { preferences: DiagnosticsPreferenceRecordPayload | null }).preferences;
      expect(latest?.highContrastEnabled).toBe(true);
      expect(latest?.remoteProvidersEnabled).toBe(true);
    });
  });

  it("surfaces storage health alerts from the diagnostics bridge", async () => {
    const { result } = renderHook(() => useDiagnostics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    harness.listeners.storageHealth?.({
      status: "degraded",
      detectedAt: new Date().toISOString(),
      reason: "permission-denied",
      message: "Vault locked",
      recommendedAction: "Check disk permissions",
      retryAvailableAt: null
    });

    await waitFor(() => {
      const latest = (result.current as unknown as { storageHealth: StorageHealthAlertPayload | null }).storageHealth;
      expect(latest?.status).toBe("degraded");
      expect(latest?.reason).toBe("permission-denied");
    });
  });

  it("forwards preference updates through the bridge and merges optimistic state", async () => {
    const { result } = renderHook(() => useDiagnostics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const api = result.current as unknown as {
      updatePreferences: (payload: {
        highContrastEnabled: boolean;
        reducedMotionEnabled: boolean;
        remoteProvidersEnabled: boolean;
        consentSummary: string;
      }) => Promise<void>;
      preferences: DiagnosticsPreferenceRecordPayload | null;
    };

    await act(async () => {
      await api.updatePreferences({
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: false,
        consentSummary: "Applied accessible layout"
      });
    });

    expect(harness.bridge.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: false,
        consentSummary: "Applied accessible layout"
      })
    );
    expect(harness.bridge.updatePreferences.mock.calls.at(-1)?.[0]?.expectedLastUpdatedAt).toBeDefined();

    const latest = api.preferences;
    expect(latest?.highContrastEnabled).toBe(true);
    expect(latest?.reducedMotionEnabled).toBe(true);
  });
});
