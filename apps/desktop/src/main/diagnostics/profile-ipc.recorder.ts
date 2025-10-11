import {
  DiagnosticsBreadcrumbSchema,
  ensureProfileCorrelationId,
  sanitizeDiagnosticsMetadata,
  type DiagnosticsBreadcrumb,
  type OperatorContext,
  type ProfileErrorCode,
  type ProfileIpcChannel,
  type SafeStorageStatus
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { randomUUID } from "node:crypto";

export type ProfileBreadcrumbMetadata = Record<string, unknown>;

export interface RecordProfileBreadcrumbOptions {
  channel: ProfileIpcChannel;
  requestId: string;
  correlationId?: string | null;
  operatorContext: OperatorContext;
  durationMs: number;
  resultCode: ProfileErrorCode;
  safeStorageStatus: SafeStorageStatus;
  metadata?: ProfileBreadcrumbMetadata | null;
}

type BreadcrumbListener = (breadcrumb: DiagnosticsBreadcrumb) => void;

export interface ProfileIpcDiagnosticsRecorderOptions {
  now?: () => number;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 200;

function cloneBreadcrumb(breadcrumb: DiagnosticsBreadcrumb): DiagnosticsBreadcrumb {
  return {
    ...breadcrumb,
    metadata: breadcrumb.metadata ? { ...breadcrumb.metadata } : undefined
  };
}

export class ProfileIpcDiagnosticsRecorder {
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly listeners = new Set<BreadcrumbListener>();
  private breadcrumbs: DiagnosticsBreadcrumb[] = [];

  constructor(options: ProfileIpcDiagnosticsRecorderOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  recordBreadcrumb(options: RecordProfileBreadcrumbOptions): DiagnosticsBreadcrumb {
    const candidate: DiagnosticsBreadcrumb = {
      id: randomUUID(),
      channel: options.channel,
      requestId: options.requestId,
      correlationId: ensureProfileCorrelationId(options.correlationId),
      operatorRole: options.operatorContext.operatorRole,
      durationMs: Math.max(0, Math.round(options.durationMs)),
      resultCode: options.resultCode,
      safeStorageStatus: options.safeStorageStatus,
      createdAt: this.now(),
      metadata: sanitizeDiagnosticsMetadata(options.metadata ?? null)
    };

    const breadcrumb = DiagnosticsBreadcrumbSchema.parse(candidate);
    this.breadcrumbs = [...this.breadcrumbs, breadcrumb].slice(-this.maxEntries);
    for (const listener of this.listeners) {
      try {
        listener(cloneBreadcrumb(breadcrumb));
      } catch {
        // Ignore listener failures to avoid interrupting diagnostics flow.
      }
    }
    return cloneBreadcrumb(breadcrumb);
  }

  onBreadcrumb(listener: BreadcrumbListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getBreadcrumbs(): DiagnosticsBreadcrumb[] {
    return this.breadcrumbs.map((breadcrumb) => cloneBreadcrumb(breadcrumb));
  }

  clear(): void {
    this.breadcrumbs = [];
  }
}
