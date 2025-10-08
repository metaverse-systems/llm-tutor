import type {
  DiagnosticsSnapshotPayload,
  ProcessHealthEventPayload
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
}

interface DiagnosticsPreloadApi {
  getState(): Promise<DiagnosticsStatePayload>;
  getProcessEvents(): Promise<ProcessHealthEventPayload[]>;
  requestSummary(): Promise<DiagnosticsSnapshotPayload | null>;
  refreshSnapshot(): Promise<DiagnosticsRefreshResult>;
  openLogDirectory(): Promise<boolean>;
  exportSnapshot(): Promise<DiagnosticsExportResult>;
  onBackendStateChanged(listener: (state: SerializableBackendProcessState) => void): () => void;
  onProcessEvent(listener: (event: ProcessHealthEventPayload) => void): () => void;
  onRetentionWarning(listener: (warning: string) => void): () => void;
  onSnapshotUpdated(listener: (snapshot: DiagnosticsSnapshotPayload | null) => void): () => void;
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
