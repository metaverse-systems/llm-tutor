import { randomUUID } from "node:crypto";
import {
  DiagnosticsSnapshot,
  DiagnosticsSnapshotPayload,
  ProcessHealthEvent,
  ProcessHealthEventPayload,
  AccessibilityPreference,
  AccessibilityPreferencePayload,
  serializeDiagnosticsSnapshot,
  serializeAccessibilityPreference
} from "./index.js";

export type AccessibilityPreferenceOverrides = Partial<AccessibilityPreference>;

export function buildAccessibilityPreference(
  overrides: AccessibilityPreferenceOverrides = {}
): AccessibilityPreference {
  const now = overrides.updatedAt ?? new Date();
  return {
    highContrast: overrides.highContrast ?? false,
    reduceMotion: overrides.reduceMotion ?? false,
    updatedAt: now
  };
}

export type DiagnosticsSnapshotOverrides =
  Partial<Omit<DiagnosticsSnapshot, "activePreferences" | "id" | "generatedAt">> &
  Partial<Pick<DiagnosticsSnapshot, "id" | "generatedAt">> & {
    activePreferences?: AccessibilityPreferenceOverrides;
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
      ? buildAccessibilityPreference(overrides.activePreferences)
      : buildAccessibilityPreference()
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

export function createAccessibilityPreferencePayload(
  preference: AccessibilityPreference
): AccessibilityPreferencePayload {
  return serializeAccessibilityPreference(preference);
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
