import { randomUUID } from "node:crypto";
import {
  DiagnosticsSnapshot,
  DiagnosticsSnapshotPayload,
  ProcessHealthEvent,
  ProcessHealthEventPayload,
  DiagnosticsPreferenceRecord,
  DiagnosticsPreferenceRecordPayload,
  serializeDiagnosticsSnapshot,
  serializeDiagnosticsPreferenceRecord,
  createDiagnosticsPreferenceRecord,
  updateDiagnosticsPreferenceRecord,
  type DiagnosticsPreferenceUpdate
} from "./index.js";
import {
  ConsentEventLog,
  ConsentEventLogPayload,
  serializeConsentEventLog
} from "./consent-event";
import {
  StorageHealthAlert,
  StorageHealthAlertPayload,
  serializeStorageHealthAlert
} from "./storage-health";

export type DiagnosticsPreferenceRecordOverrides = Partial<DiagnosticsPreferenceRecord> & {
  consentEvents?: Array<ConsentEventLog | ConsentEventLogPayload>;
};

export function buildDiagnosticsPreferenceRecord(
  overrides: DiagnosticsPreferenceRecordOverrides = {}
): DiagnosticsPreferenceRecord {
  const seed = createDiagnosticsPreferenceRecord({
    id: overrides.id,
    highContrastEnabled: overrides.highContrastEnabled,
    reducedMotionEnabled: overrides.reducedMotionEnabled,
    remoteProvidersEnabled: overrides.remoteProvidersEnabled,
    lastUpdatedAt: overrides.lastUpdatedAt,
    updatedBy: overrides.updatedBy,
    consentSummary: overrides.consentSummary,
    storageHealth: overrides.storageHealth ?? null,
    consentEvents: overrides.consentEvents
  });

  return seed;
}

export function mutateDiagnosticsPreferenceRecord(
  record: DiagnosticsPreferenceRecord,
  update: DiagnosticsPreferenceUpdate
): DiagnosticsPreferenceRecord {
  return updateDiagnosticsPreferenceRecord(record, update);
}

export type ConsentEventLogOverrides = Partial<ConsentEventLog> & {
  occurredAt?: Date;
};

export function buildConsentEventLog(
  overrides: ConsentEventLogOverrides = {}
): ConsentEventLog {
  return {
    eventId: overrides.eventId ?? randomUUID(),
    occurredAt: overrides.occurredAt ?? new Date(),
    actor: overrides.actor ?? "learner",
    previousState: overrides.previousState ?? "disabled",
    nextState: overrides.nextState ?? "enabled",
    noticeVersion: overrides.noticeVersion ?? "v1",
    channel: overrides.channel ?? "ui-toggle"
  };
}

export function createConsentEventLogPayload(event: ConsentEventLog): ConsentEventLogPayload {
  return serializeConsentEventLog(event);
}

export type StorageHealthAlertOverrides = Partial<StorageHealthAlert> & {
  detectedAt?: Date;
  reason?: StorageHealthAlert["reason"];
  status?: StorageHealthAlert["status"];
};

export function buildStorageHealthAlert(
  overrides: StorageHealthAlertOverrides = {}
): StorageHealthAlert {
  return {
    status: overrides.status ?? "degraded",
    detectedAt: overrides.detectedAt ?? new Date(),
    reason: overrides.reason ?? "unknown",
    message: overrides.message ?? "Storage performance degraded",
    recommendedAction:
      overrides.recommendedAction ??
      "Retry shortly or review filesystem permissions before continuing.",
    retryAvailableAt: overrides.retryAvailableAt ?? null
  };
}

export function createStorageHealthAlertPayload(
  alert: StorageHealthAlert
): StorageHealthAlertPayload {
  return serializeStorageHealthAlert(alert);
}

export type DiagnosticsSnapshotOverrides =
  Partial<Omit<DiagnosticsSnapshot, "activePreferences" | "id" | "generatedAt">> &
  Partial<Pick<DiagnosticsSnapshot, "id" | "generatedAt">> & {
    activePreferences?: DiagnosticsPreferenceRecordOverrides;
  };

export function buildDiagnosticsSnapshot(
  overrides: DiagnosticsSnapshotOverrides = {}
): DiagnosticsSnapshot {
  const generatedAt = overrides.generatedAt ?? new Date();
  return {
    id: overrides.id ?? randomUUID(),
    generatedAt,
    backendStatus: overrides.backendStatus ?? "running",
    backendMessage: overrides.backendMessage,
    rendererUrl: overrides.rendererUrl ?? "http://localhost:5173",
    llmStatus: overrides.llmStatus ?? "disabled",
    llmEndpoint: overrides.llmEndpoint,
    logDirectory: overrides.logDirectory ?? "/tmp/llm-tutor/diagnostics",
    snapshotCountLast30d: overrides.snapshotCountLast30d,
    diskUsageBytes: overrides.diskUsageBytes ?? 0,
    warnings: overrides.warnings ? [...overrides.warnings] : [],
    activePreferences: overrides.activePreferences
      ? buildDiagnosticsPreferenceRecord(overrides.activePreferences)
      : buildDiagnosticsPreferenceRecord()
  };
}

export type ProcessHealthEventOverrides = Partial<ProcessHealthEvent>;

export function buildProcessHealthEvent(
  overrides: ProcessHealthEventOverrides = {}
): ProcessHealthEvent {
  const occurredAt = overrides.occurredAt ?? new Date();
  return {
    id: overrides.id ?? randomUUID(),
    occurredAt,
    type: overrides.type ?? "spawn",
    exitCode: overrides.exitCode ?? null,
    reason: overrides.reason ?? "Diagnostics lifecycle event"
  };
}

export function createDiagnosticsSnapshotPayload(
  snapshot: DiagnosticsSnapshot
): DiagnosticsSnapshotPayload {
  return serializeDiagnosticsSnapshot(snapshot);
}

export function createProcessHealthEventPayload(
  event: ProcessHealthEvent
): ProcessHealthEventPayload {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    type: event.type,
    exitCode: event.exitCode,
    reason: event.reason
  };
}
