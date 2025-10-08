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
  ProcessHealthEventPayload
} from "@metaverse-systems/llm-tutor-shared";
import { useDiagnostics } from "../../src/hooks/useDiagnostics";

type ListenerMap = {
  backend?: (payload: unknown) => void;
  processEvent?: (payload: ProcessHealthEventPayload) => void;
  retentionWarning?: (payload: string) => void;
  snapshotUpdated?: (payload: DiagnosticsSnapshotPayload | null) => void;
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

  const getState = vi.fn().mockResolvedValue({
    backend,
    warnings: ["initial-warning"],
    latestSnapshot: snapshot,
    processEvents: [] satisfies ProcessHealthEventPayload[]
  });

  const getProcessEvents = vi.fn().mockResolvedValue([] as ProcessHealthEventPayload[]);
  const requestSummary = vi.fn().mockResolvedValue(snapshot);
  const refreshSnapshot = vi.fn().mockResolvedValue({ success: true, snapshot });
  const openLogDirectory = vi.fn().mockResolvedValue(true);
  const exportSnapshot = vi.fn().mockResolvedValue({ success: true, filename: "snapshot.jsonl" });

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
    getProcessEvents,
    requestSummary,
    refreshSnapshot,
    openLogDirectory,
    exportSnapshot,
    onBackendStateChanged: registerListener("backend"),
    onProcessEvent: registerListener("processEvent"),
    onRetentionWarning: registerListener("retentionWarning"),
    onSnapshotUpdated: registerListener("snapshotUpdated")
  };

  return { bridge, listeners, snapshot, backend };
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
});
