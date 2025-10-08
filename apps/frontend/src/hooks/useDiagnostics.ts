import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiagnosticsSnapshotPayload,
  ProcessHealthEventPayload,
  DiagnosticsPreferenceRecordPayload,
  StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_OFFLINE_RETRY_MS = 15_000;
const MAX_PROCESS_EVENTS = 25;
const DEFAULT_PREFERENCE_REFRESH_DEBOUNCE_MS = 750;

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

interface DiagnosticsPreferenceUpdatePayload {
  highContrastEnabled: boolean;
  reducedMotionEnabled: boolean;
  remoteProvidersEnabled: boolean;
  consentSummary: string;
  expectedLastUpdatedAt?: string;
  consentEvent?: unknown;
}

type DiagnosticsPreferenceUpdateResult =
  | DiagnosticsPreferenceRecordPayload
  | {
      record: DiagnosticsPreferenceRecordPayload;
      storageHealth?: StorageHealthAlertPayload | null;
    };

interface PreferenceUpdateInput {
  highContrastEnabled: boolean;
  reducedMotionEnabled: boolean;
  remoteProvidersEnabled: boolean;
  consentSummary: string;
  consentEvent?: unknown;
}

interface DiagnosticsStatePayload {
  backend: BackendProcessStatePayload;
  warnings: string[];
  latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
  processEvents: ProcessHealthEventPayload[];
  preferences?: DiagnosticsPreferenceRecordPayload | null;
  storageHealth?: StorageHealthAlertPayload | null;
}

interface DiagnosticsBridge {
  getState(): Promise<DiagnosticsStatePayload>;
  getProcessEvents(): Promise<ProcessHealthEventPayload[]>;
  getPreferences?(): Promise<DiagnosticsPreferenceRecordPayload | null>;
  requestSummary(): Promise<DiagnosticsSnapshotPayload | null>;
  refreshSnapshot(): Promise<DiagnosticsRefreshResultPayload>;
  openLogDirectory(): Promise<boolean>;
  exportSnapshot(): Promise<DiagnosticsExportResultPayload>;
  updatePreferences?(payload: DiagnosticsPreferenceUpdatePayload): Promise<DiagnosticsPreferenceUpdateResult>;
  onBackendStateChanged?(listener: (state: BackendProcessStatePayload) => void): () => void;
  onProcessEvent?(listener: (event: ProcessHealthEventPayload) => void): () => void;
  onRetentionWarning?(listener: (warning: string) => void): () => void;
  onSnapshotUpdated?(listener: (snapshot: DiagnosticsSnapshotPayload | null) => void): () => void;
  onPreferencesUpdated?(listener: (payload: DiagnosticsPreferenceRecordPayload) => void): () => void;
  onStorageHealthChanged?(listener: (payload: StorageHealthAlertPayload | null) => void): () => void;
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
  preferences: DiagnosticsPreferenceRecordPayload | null;
  storageHealth: StorageHealthAlertPayload | null;
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  isUpdatingPreferences: boolean;
  error?: string;
}

export interface UseDiagnosticsResult {
  backend: BackendProcessStatePayload | null;
  snapshot: DiagnosticsSnapshotPayload | null;
  warnings: string[];
  processEvents: ProcessHealthEventPayload[];
  preferences: DiagnosticsPreferenceRecordPayload | null;
  storageHealth: StorageHealthAlertPayload | null;
  lastUpdatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isOffline: boolean;
  isUpdatingPreferences: boolean;
  error?: string;
  refresh: () => Promise<DiagnosticsRefreshOutcome>;
  requestSummary: () => Promise<DiagnosticsSnapshotPayload | null>;
  openLogDirectory: () => Promise<boolean>;
  exportSnapshot: () => Promise<DiagnosticsExportResultPayload>;
  updatePreferences: (payload: PreferenceUpdateInput) => Promise<DiagnosticsPreferenceRecordPayload | null>;
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

function clonePreferenceRecord(
  record: DiagnosticsPreferenceRecordPayload | null | undefined
): DiagnosticsPreferenceRecordPayload | null {
  if (!record) {
    return null;
  }
  return {
    ...record,
    consentEvents: Array.isArray(record.consentEvents)
      ? [...record.consentEvents]
      : [],
    storageHealth: record.storageHealth ? { ...record.storageHealth } : null
  };
}

function cloneStorageHealth(alert: StorageHealthAlertPayload | null | undefined): StorageHealthAlertPayload | null {
  if (!alert) {
    return null;
  }
  return { ...alert };
}

export function useDiagnostics(options: UseDiagnosticsOptions = {}): UseDiagnosticsResult {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const offlineRetryMs = options.offlineRetryMs ?? DEFAULT_OFFLINE_RETRY_MS;

  const [bridge, setBridge] = useState<DiagnosticsBridge | null>(() => getBridge());
  const bridgeRef = useRef<DiagnosticsBridge | null>(bridge);
  const offlineUntilRef = useRef<number>(0);
  const pollTimerRef = useRef<number | NodeJS.Timeout | null>(null);
  const preferenceRefreshTimerRef = useRef<number | NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const clearPreferenceRefreshTimer = useCallback(() => {
    if (preferenceRefreshTimerRef.current !== null) {
      clearTimeout(preferenceRefreshTimerRef.current as NodeJS.Timeout);
      preferenceRefreshTimerRef.current = null;
    }
  }, []);

  const [state, setState] = useState<InternalDiagnosticsState>(() => ({
    backend: null,
    snapshot: null,
    warnings: [],
    processEvents: [],
    preferences: null,
    storageHealth: null,
    lastUpdatedAt: null,
    isLoading: true,
    isRefreshing: false,
    isOffline: false,
    isUpdatingPreferences: false
  }));
  const resultRef = useRef<UseDiagnosticsResult | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearPreferenceRefreshTimer();
    };
  }, [clearPreferenceRefreshTimer]);

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
      const preferencesFromState = clonePreferenceRecord(payload.preferences);
      let preferencesFromApi: DiagnosticsPreferenceRecordPayload | null = null;
      if (!preferencesFromState && typeof api.getPreferences === "function") {
        try {
          preferencesFromApi = await api.getPreferences();
        } catch (error) {
          console.warn("Diagnostics bridge failed to load preferences", error);
        }
      }
      const resolvedPreferences = clonePreferenceRecord(preferencesFromState ?? preferencesFromApi);
      const resolvedStorageHealth = cloneStorageHealth(
        payload.storageHealth ?? resolvedPreferences?.storageHealth ?? null
      );
      if (!isMountedRef.current) {
        return;
      }
      setState((prev) => ({
        ...prev,
        backend: payload.backend ?? prev.backend,
        snapshot: payload.latestSnapshot ?? null,
        warnings: mergeWarnings(payload.warnings ?? [], prev.warnings),
        processEvents: payload.processEvents
          ? payload.processEvents.slice(0, MAX_PROCESS_EVENTS)
          : prev.processEvents,
        preferences: resolvedPreferences ?? prev.preferences,
        storageHealth: resolvedStorageHealth ?? prev.storageHealth,
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

    if (typeof api.onPreferencesUpdated === "function") {
      disposers.push(
        api.onPreferencesUpdated((record) => {
          if (!isMountedRef.current) {
            return;
          }
          setState((prev) => ({
            ...prev,
            preferences: clonePreferenceRecord(record) ?? prev.preferences,
            storageHealth: cloneStorageHealth(record?.storageHealth ?? prev.storageHealth),
            isUpdatingPreferences: false
          }));
        })
      );
    }

    if (typeof api.onStorageHealthChanged === "function") {
      disposers.push(
        api.onStorageHealthChanged((alert) => {
          if (!isMountedRef.current) {
            return;
          }
          setState((prev) => ({
            ...prev,
            storageHealth: cloneStorageHealth(alert)
          }));
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

  const schedulePreferenceRefresh = useCallback(() => {
    clearPreferenceRefreshTimer();
    preferenceRefreshTimerRef.current = setTimeout(() => {
      preferenceRefreshTimerRef.current = null;
      void pollSummary();
    }, DEFAULT_PREFERENCE_REFRESH_DEBOUNCE_MS);
  }, [clearPreferenceRefreshTimer, pollSummary]);

  useEffect(() => {
    pollSummary();
    if (!bridge) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    pollTimerRef.current = setInterval(pollSummary, pollIntervalMs);
    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current as NodeJS.Timeout);
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

  const updatePreferences = useCallback(
    async (input: PreferenceUpdateInput): Promise<DiagnosticsPreferenceRecordPayload | null> => {
      const api = bridgeRef.current;
      if (!api || typeof api.updatePreferences !== "function") {
        console.warn("Diagnostics bridge unavailable; cannot update preferences");
        return null;
      }

      const baseline = clonePreferenceRecord(
        state.preferences ?? state.snapshot?.activePreferences ?? null
      );
      const optimisticRecord = baseline
        ? {
            ...baseline,
            highContrastEnabled: input.highContrastEnabled,
            reducedMotionEnabled: input.reducedMotionEnabled,
            remoteProvidersEnabled: input.remoteProvidersEnabled,
            consentSummary: input.consentSummary,
            updatedBy: "renderer" as const,
            lastUpdatedAt: new Date().toISOString()
          }
        : null;

      setState((prev) => ({
        ...prev,
        preferences: optimisticRecord ?? prev.preferences,
        storageHealth: optimisticRecord?.storageHealth ?? prev.storageHealth,
        isUpdatingPreferences: true
      }));

      const updatePayload: DiagnosticsPreferenceUpdatePayload = {
        highContrastEnabled: input.highContrastEnabled,
        reducedMotionEnabled: input.reducedMotionEnabled,
        remoteProvidersEnabled: input.remoteProvidersEnabled,
        consentSummary: input.consentSummary
      };

      if (state.preferences?.lastUpdatedAt) {
        updatePayload.expectedLastUpdatedAt = state.preferences.lastUpdatedAt;
      }

      if (input.consentEvent) {
        updatePayload.consentEvent = input.consentEvent;
      }

      try {
        const response = await api.updatePreferences(updatePayload);
        let resolvedRecord: DiagnosticsPreferenceRecordPayload | null = null;
        let resolvedStorage: StorageHealthAlertPayload | null = null;

        if (response && typeof (response as { record?: unknown }).record !== "undefined") {
          const payload = response as {
            record: DiagnosticsPreferenceRecordPayload;
            storageHealth?: StorageHealthAlertPayload | null;
          };
          resolvedRecord = payload.record;
          resolvedStorage = payload.storageHealth ?? payload.record?.storageHealth ?? null;
        } else {
          const payload = response as DiagnosticsPreferenceRecordPayload;
          resolvedRecord = payload;
          resolvedStorage =
            (payload as DiagnosticsPreferenceRecordPayload & {
              storageHealth?: StorageHealthAlertPayload | null;
            }).storageHealth ?? null;
        }

        const nextRecord = clonePreferenceRecord(resolvedRecord ?? optimisticRecord);
        const nextStorage = cloneStorageHealth(resolvedStorage ?? nextRecord?.storageHealth ?? null);

        setState((prev) => ({
          ...prev,
          preferences: nextRecord ?? prev.preferences,
          storageHealth: nextStorage ?? prev.storageHealth,
          isUpdatingPreferences: false
        }));

        schedulePreferenceRefresh();
        return nextRecord;
      } catch (error) {
        console.warn("Failed to update diagnostics preferences", error);
        setState((prev) => ({
          ...prev,
          isUpdatingPreferences: false
        }));
        return optimisticRecord ?? state.preferences ?? null;
      }
    },
    [schedulePreferenceRefresh, state.preferences, state.snapshot?.activePreferences]
  );

  const combinedWarnings = useMemo(() => {
    return mergeWarnings(state.warnings, state.snapshot?.warnings ?? []);
  }, [state.snapshot?.warnings, state.warnings]);

  if (!resultRef.current) {
    resultRef.current = {
      backend: state.backend,
      snapshot: state.snapshot,
      warnings: combinedWarnings,
      processEvents: state.processEvents,
      preferences: state.preferences,
      storageHealth: state.storageHealth,
      lastUpdatedAt: state.lastUpdatedAt,
      isLoading: state.isLoading,
      isRefreshing: state.isRefreshing,
      isOffline: state.isOffline,
      isUpdatingPreferences: state.isUpdatingPreferences,
      error: state.error,
      refresh,
      requestSummary,
      openLogDirectory,
      exportSnapshot,
      updatePreferences
    };
  } else {
    const target = resultRef.current;
    target.backend = state.backend;
    target.snapshot = state.snapshot;
    target.warnings = combinedWarnings;
    target.processEvents = state.processEvents;
    target.preferences = state.preferences;
    target.storageHealth = state.storageHealth;
    target.lastUpdatedAt = state.lastUpdatedAt;
    target.isLoading = state.isLoading;
    target.isRefreshing = state.isRefreshing;
    target.isOffline = state.isOffline;
    target.isUpdatingPreferences = state.isUpdatingPreferences;
    target.error = state.error;
    target.refresh = refresh;
    target.requestSummary = requestSummary;
    target.openLogDirectory = openLogDirectory;
    target.exportSnapshot = exportSnapshot;
    target.updatePreferences = updatePreferences;
  }

  return resultRef.current;
}
