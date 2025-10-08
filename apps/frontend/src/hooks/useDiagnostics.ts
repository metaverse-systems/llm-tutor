import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiagnosticsSnapshotPayload,
  ProcessHealthEventPayload
} from "@metaverse-systems/llm-tutor-shared";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_OFFLINE_RETRY_MS = 15_000;
const MAX_PROCESS_EVENTS = 25;

interface BackendProcessStatePayload {
  status: "stopped" | "starting" | "running" | "error";
  message?: string;
  pid?: number;
  lastExitCode?: number | null;
  lastExitSignal?: string | null;
  updatedAt: string;
}

interface DiagnosticsRefreshResultPayload {
  success: boolean;
  snapshot?: DiagnosticsSnapshotPayload;
  error?: {
    errorCode: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

interface DiagnosticsStatePayload {
  backend: BackendProcessStatePayload;
  warnings: string[];
  latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
  processEvents: ProcessHealthEventPayload[];
}

interface DiagnosticsBridge {
  getState(): Promise<DiagnosticsStatePayload>;
  getProcessEvents(): Promise<ProcessHealthEventPayload[]>;
  requestSummary(): Promise<DiagnosticsSnapshotPayload | null>;
  refreshSnapshot(): Promise<DiagnosticsRefreshResultPayload>;
  openLogDirectory(): Promise<boolean>;
  exportSnapshot(): Promise<DiagnosticsExportResultPayload>;
  onBackendStateChanged?(listener: (state: BackendProcessStatePayload) => void): () => void;
  onProcessEvent?(listener: (event: ProcessHealthEventPayload) => void): () => void;
  onRetentionWarning?(listener: (warning: string) => void): () => void;
  onSnapshotUpdated?(listener: (snapshot: DiagnosticsSnapshotPayload | null) => void): () => void;
}

type DiagnosticsRefreshOutcome = DiagnosticsRefreshResultPayload | null;

interface UseDiagnosticsOptions {
  pollIntervalMs?: number;
  offlineRetryMs?: number;
}

interface InternalDiagnosticsState {
  backend: BackendProcessStatePayload | null;
  snapshot: DiagnosticsSnapshotPayload | null;
  warnings: string[];
  processEvents: ProcessHealthEventPayload[];
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  error?: string;
}

export interface UseDiagnosticsResult {
  backend: BackendProcessStatePayload | null;
  snapshot: DiagnosticsSnapshotPayload | null;
  warnings: string[];
  processEvents: ProcessHealthEventPayload[];
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  error?: string;
  refresh: () => Promise<DiagnosticsRefreshOutcome>;
  requestSummary: () => Promise<DiagnosticsSnapshotPayload | null>;
  openLogDirectory: () => Promise<boolean>;
  exportSnapshot: () => Promise<DiagnosticsExportResultPayload>;
}

interface DiagnosticsExportResultPayload {
  success: boolean;
  filename?: string;
}

function getBridge(): DiagnosticsBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.llmTutor?.diagnostics ?? null;
}

function mergeWarnings(existing: string[], incoming: string[]): string[] {
  const next = new Set<string>();
  for (const value of existing) {
    if (value) {
      next.add(value);
    }
  }
  for (const value of incoming) {
    if (value) {
      next.add(value);
    }
  }
  return Array.from(next);
}

function normalizeProcessEvents(
  current: ProcessHealthEventPayload[],
  incoming: ProcessHealthEventPayload
): ProcessHealthEventPayload[] {
  const next = [incoming, ...current.filter((event) => event.id !== incoming.id)];
  next.sort((a, b) => {
    const first = Date.parse(b.occurredAt ?? "");
    const second = Date.parse(a.occurredAt ?? "");
    return Number.isFinite(first) && Number.isFinite(second) ? first - second : 0;
  });
  return next.slice(0, MAX_PROCESS_EVENTS);
}

export function useDiagnostics(options: UseDiagnosticsOptions = {}): UseDiagnosticsResult {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const offlineRetryMs = options.offlineRetryMs ?? DEFAULT_OFFLINE_RETRY_MS;

  const [bridge, setBridge] = useState<DiagnosticsBridge | null>(() => getBridge());
  const bridgeRef = useRef<DiagnosticsBridge | null>(bridge);
  const offlineUntilRef = useRef<number>(0);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const [state, setState] = useState<InternalDiagnosticsState>(() => ({
    backend: null,
    snapshot: null,
    warnings: [],
    processEvents: [],
    lastUpdatedAt: null,
    isLoading: true,
    isRefreshing: false,
    isOffline: false
  }));

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  useEffect(() => {
    if (bridge) {
      return;
    }

    if (typeof window === "undefined") {
      setState((prev) => ({ ...prev, isLoading: false, isOffline: true }));
      return;
    }

    let cancelled = false;

    const attempt = () => {
      if (cancelled) {
        return;
      }
      const nextBridge = getBridge();
      if (nextBridge) {
        setBridge(nextBridge);
      } else {
        window.setTimeout(attempt, 300);
      }
    };

    attempt();

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const updateWithSnapshot = useCallback((snapshot: DiagnosticsSnapshotPayload | null) => {
    setState((prev) => {
      if (!snapshot) {
        return {
          ...prev,
          snapshot: null,
          lastUpdatedAt: prev.lastUpdatedAt,
          isLoading: false
        };
      }
      const generatedAt = Date.parse(snapshot.generatedAt ?? "");
      const lastUpdatedAt = Number.isFinite(generatedAt) ? new Date(generatedAt) : prev.lastUpdatedAt;
      return {
        ...prev,
        snapshot,
        warnings: mergeWarnings(prev.warnings, snapshot.warnings ?? []),
        lastUpdatedAt,
        isLoading: false,
        isOffline: false,
        error: undefined
      };
    });
  }, []);

  const handleBridgeFailure = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      offlineUntilRef.current = Date.now() + offlineRetryMs;
      if (!isMountedRef.current) {
        return;
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        isOffline: true,
        error: message
      }));
    },
    [offlineRetryMs]
  );

  const loadInitialState = useCallback(async () => {
    const api = bridgeRef.current;
    if (!api) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    try {
      const payload = await api.getState();
      if (!isMountedRef.current) {
        return;
      }
      setState((prev) => ({
        ...prev,
        backend: payload.backend ?? prev.backend,
        snapshot: payload.latestSnapshot ?? null,
        warnings: mergeWarnings(prev.warnings, payload.warnings ?? []),
        processEvents: payload.processEvents
          ? payload.processEvents.slice(0, MAX_PROCESS_EVENTS)
          : prev.processEvents,
        lastUpdatedAt: payload.latestSnapshot
          ? new Date(Date.parse(payload.latestSnapshot.generatedAt ?? ""))
          : prev.lastUpdatedAt,
        isLoading: false,
        isOffline: false,
        error: undefined
      }));
    } catch (error) {
      handleBridgeFailure(error);
    }
  }, [handleBridgeFailure]);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState, bridge]);

  useEffect(() => {
    const api = bridgeRef.current;
    if (!api) {
      return;
    }

    const disposers: Array<() => void> = [];

    if (typeof api.onBackendStateChanged === "function") {
      disposers.push(
        api.onBackendStateChanged((backend) => {
          if (!isMountedRef.current) {
            return;
          }
          setState((prev) => ({ ...prev, backend }));
        })
      );
    }

    if (typeof api.onProcessEvent === "function") {
      disposers.push(
        api.onProcessEvent((event) => {
          if (!isMountedRef.current) {
            return;
          }
          setState((prev) => ({
            ...prev,
            processEvents: normalizeProcessEvents(prev.processEvents, event)
          }));
        })
      );
    }

    if (typeof api.onRetentionWarning === "function") {
      disposers.push(
        api.onRetentionWarning((warning) => {
          if (!isMountedRef.current) {
            return;
          }
          setState((prev) => ({
            ...prev,
            warnings: mergeWarnings(prev.warnings, [warning])
          }));
        })
      );
    }

    if (typeof api.onSnapshotUpdated === "function") {
      disposers.push(
        api.onSnapshotUpdated((snapshot) => {
          if (!isMountedRef.current) {
            return;
          }
          updateWithSnapshot(snapshot);
        })
      );
    }

    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (error) {
          console.warn("Failed to dispose diagnostics listener", error);
        }
      }
    };
  }, [updateWithSnapshot, bridge]);

  const pollSummary = useCallback(async () => {
    const api = bridgeRef.current;
    if (!api) {
      return;
    }
    if (Date.now() < offlineUntilRef.current) {
      return;
    }
    try {
      const snapshot = await api.requestSummary();
      if (!isMountedRef.current) {
        return;
      }
      updateWithSnapshot(snapshot);
    } catch (error) {
      handleBridgeFailure(error);
    }
  }, [handleBridgeFailure, updateWithSnapshot]);

  useEffect(() => {
    pollSummary();
    if (!bridge) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    pollTimerRef.current = window.setInterval(pollSummary, pollIntervalMs);
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [bridge, pollIntervalMs, pollSummary]);

  const refresh = useCallback(async (): Promise<DiagnosticsRefreshOutcome> => {
    const api = bridgeRef.current;
    if (!api) {
      setState((prev) => ({
        ...prev,
        error: "Diagnostics bridge unavailable"
      }));
      return null;
    }

    setState((prev) => ({
      ...prev,
      isRefreshing: true,
      error: undefined
    }));

    try {
      const result = await api.refreshSnapshot();
      if (!isMountedRef.current) {
        return result;
      }
      if (result?.snapshot) {
        updateWithSnapshot(result.snapshot);
      } else if (result?.error) {
        handleBridgeFailure(new Error(result.error.message));
      } else {
        setState((prev) => ({
          ...prev,
          isRefreshing: false,
          isOffline: false
        }));
      }
      return result;
    } catch (error) {
      handleBridgeFailure(error);
      return null;
    } finally {
      setState((prev) => ({ ...prev, isRefreshing: false }));
    }
  }, [handleBridgeFailure, updateWithSnapshot]);

  const requestSummary = useCallback(async () => {
    const api = bridgeRef.current;
    if (!api) {
      return state.snapshot;
    }
    if (Date.now() < offlineUntilRef.current) {
      return state.snapshot;
    }
    try {
      const snapshot = await api.requestSummary();
      if (!isMountedRef.current) {
        return snapshot;
      }
      updateWithSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      handleBridgeFailure(error);
      return state.snapshot;
    }
  }, [handleBridgeFailure, state.snapshot, updateWithSnapshot]);

  const openLogDirectory = useCallback(async () => {
    const api = bridgeRef.current;
    if (!api) {
      console.info("Diagnostics bridge unavailable; cannot open log directory");
      return false;
    }
    try {
      return await api.openLogDirectory();
    } catch (error) {
      handleBridgeFailure(error);
      return false;
    }
  }, [handleBridgeFailure]);

  const exportSnapshot = useCallback(async (): Promise<DiagnosticsExportResultPayload> => {
    const api = bridgeRef.current;
    if (!api) {
      return { success: false };
    }
    try {
      return await api.exportSnapshot();
    } catch (error) {
      handleBridgeFailure(error);
      return { success: false };
    }
  }, [handleBridgeFailure]);

  const combinedWarnings = useMemo(() => {
    return mergeWarnings(state.warnings, state.snapshot?.warnings ?? []);
  }, [state.snapshot?.warnings, state.warnings]);

  return {
    backend: state.backend,
    snapshot: state.snapshot,
    warnings: combinedWarnings,
    processEvents: state.processEvents,
    lastUpdatedAt: state.lastUpdatedAt,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    isOffline: state.isOffline,
    error: state.error,
    refresh,
    requestSummary,
    openLogDirectory,
    exportSnapshot
  };
}
