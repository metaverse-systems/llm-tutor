import type {
  DiagnosticsSnapshotPayload,
  ProcessHealthEventPayload,
  DiagnosticsPreferenceRecordPayload,
  StorageHealthAlertPayload,
  DiagnosticsExportRequestPayload
} from "@metaverse-systems/llm-tutor-shared";

export {}; // Ensures this file is treated as a module

interface SerializableBackendProcessState {
  status: "stopped" | "starting" | "running" | "error";
  message?: string;
  pid?: number;
  lastExitCode?: number | null;
  lastExitSignal?: string | null;
  updatedAt: string;
}

interface DiagnosticsStatePayload {
  backend: SerializableBackendProcessState;
  warnings: string[];
  latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
  processEvents: ProcessHealthEventPayload[];
  preferences: DiagnosticsPreferenceRecordPayload | null;
  storageHealth: StorageHealthAlertPayload | null;
}

interface DiagnosticsRefreshResult {
  success: boolean;
  snapshot?: DiagnosticsSnapshotPayload;
  error?: {
    errorCode: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

interface DiagnosticsExportResult {
  success: boolean;
  filename?: string;
  logPath?: string;
}

interface DiagnosticsPreloadApi {
  getState(): Promise<DiagnosticsStatePayload>;
  getProcessEvents(): Promise<ProcessHealthEventPayload[]>;
  requestSummary(): Promise<DiagnosticsSnapshotPayload | null>;
  refreshSnapshot(): Promise<DiagnosticsRefreshResult>;
  openLogDirectory(): Promise<boolean>;
  exportSnapshot(payload?: DiagnosticsExportRequestPayload): Promise<DiagnosticsExportResult>;
  updatePreferences(payload: DiagnosticsPreferenceUpdatePayload): Promise<DiagnosticsPreferenceRecordPayload>;
  onBackendStateChanged(listener: (state: SerializableBackendProcessState) => void): () => void;
  onProcessEvent(listener: (event: ProcessHealthEventPayload) => void): () => void;
  onRetentionWarning(listener: (warning: string) => void): () => void;
  onSnapshotUpdated(listener: (snapshot: DiagnosticsSnapshotPayload | null) => void): () => void;
  onPreferencesUpdated(listener: (payload: DiagnosticsPreferenceRecordPayload) => void): () => void;
  onStorageHealthChanged(
    listener: (payload: StorageHealthAlertPayload | null) => void
  ): () => void;
}

interface DiagnosticsPreferenceUpdatePayload {
  highContrastEnabled: boolean;
  reducedMotionEnabled: boolean;
  remoteProvidersEnabled: boolean;
  consentSummary: string;
  expectedLastUpdatedAt?: string;
  consentEvent?: unknown;
}

declare global {
  interface Window {
    llmTutor?: {
      ping: () => Promise<string>;
      diagnosticsSnapshot: () => Promise<unknown>;
      diagnostics: DiagnosticsPreloadApi;
    };
  }
}

declare module "*.css";
