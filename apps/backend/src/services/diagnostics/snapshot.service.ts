import { randomUUID } from "node:crypto";
import {
  DiagnosticsPreferenceRecord,
  DiagnosticsSnapshot
} from "@metaverse-systems/llm-tutor-shared";

const DEFAULT_RETENTION_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BackendLifecycleStatus = "running" | "stopped" | "error";

export interface BackendHealthState {
  status: BackendLifecycleStatus;
  message?: string;
}

export interface LlmProbeResult {
  status: DiagnosticsSnapshot["llmStatus"];
  endpoint?: string;
  warnings?: string[];
}

export interface DiagnosticsSnapshotRepository {
  listSnapshots(): Promise<DiagnosticsSnapshot[]>;
}

export interface DiagnosticsStorageMetricsCollector {
  getDiskUsageBytes(): Promise<number>;
  getWarnings(): Promise<string[]>;
}

export interface MutableDiagnosticsStorageMetricsCollector
  extends DiagnosticsStorageMetricsCollector {
  setDiskUsageBytes(bytes: number): void;
  setWarnings(warnings: string[]): void;
}

export interface DiagnosticsSnapshotServiceOptions {
  storageDir: string;
  rendererUrlProvider: () => string | Promise<string>;
  backendStateProvider: () => BackendHealthState;
  preferenceRecordLoader: () => Promise<DiagnosticsPreferenceRecord>;
  llmProbe: () => Promise<LlmProbeResult>;
  retentionWindowDays?: number;
  now?: () => Date;
}

export class DiagnosticsSnapshotService {
  constructor(
    private readonly repository: DiagnosticsSnapshotRepository,
    private readonly metricsCollector: DiagnosticsStorageMetricsCollector,
    private readonly options: DiagnosticsSnapshotServiceOptions
  ) {}

  async generateSnapshot(): Promise<DiagnosticsSnapshot> {
    const now = this.options.now?.() ?? new Date();
    const rendererUrl = await Promise.resolve(this.options.rendererUrlProvider());
    const backend = this.options.backendStateProvider();
  const preferences = await this.options.preferenceRecordLoader();
    const llm = await this.options.llmProbe();
    const diskUsageBytes = await this.metricsCollector.getDiskUsageBytes();
    const existingSnapshots = await this.repository.listSnapshots();
    const windowMs = (this.options.retentionWindowDays ?? DEFAULT_RETENTION_WINDOW_DAYS) * MS_PER_DAY;

    // Compute snapshotCountLast30d here; this service is the single authority for this value.
    // Callers (e.g., routes) should NOT recompute or override this value.
    const countLastWindow = existingSnapshots.filter((snapshot) => {
      return now.getTime() - snapshot.generatedAt.getTime() < windowMs;
    }).length + 1;

    const metricWarnings = await this.metricsCollector.getWarnings();
    const combinedWarnings = new Set<string>();
    for (const warning of metricWarnings) {
      if (warning) {
        combinedWarnings.add(warning);
      }
    }
    if (Array.isArray(llm.warnings)) {
      for (const warning of llm.warnings) {
        if (warning) {
          combinedWarnings.add(warning);
        }
      }
    }

    const snapshot: DiagnosticsSnapshot = {
      id: randomUUID(),
      generatedAt: now,
      backendStatus: backend.status,
      backendMessage: backend.message,
      rendererUrl,
      llmStatus: llm.status,
      llmEndpoint: llm.endpoint,
      logDirectory: this.options.storageDir,
      // NOTE: snapshotCountLast30d should only be computed here.
      snapshotCountLast30d: countLastWindow,
      diskUsageBytes,
    warnings: Array.from(combinedWarnings),
    activePreferences: preferences
    };

    if (snapshot.warnings.length === 0) {
      snapshot.warnings = [];
    }

    return snapshot;
  }
}

export function createMutableDiagnosticsStorageMetricsCollector(
  initialState: { diskUsageBytes?: number; warnings?: string[] } = {}
): MutableDiagnosticsStorageMetricsCollector {
  let diskUsageBytes = initialState.diskUsageBytes ?? 0;
  let warnings = initialState.warnings ? [...initialState.warnings] : [];

  return {
    async getDiskUsageBytes() {
      return diskUsageBytes;
    },
    async getWarnings() {
      return [...warnings];
    },
    setDiskUsageBytes(bytes: number) {
      diskUsageBytes = Math.max(0, bytes);
    },
    setWarnings(nextWarnings: string[]) {
      warnings = nextWarnings.filter((warning) => warning.length > 0);
    }
  };
}
