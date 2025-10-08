import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	appendConsentEvent,
	consentEventLogSchema,
	CONSENT_EVENT_WINDOW,
	normalizeConsentEvents,
	parseConsentEventLog,
	serializeConsentEventLog,
	type ConsentEventLog,
	type ConsentEventLogPayload
} from "./consent-event";
import {
	createStorageHealthAlert,
	parseStorageHealthAlert,
	serializeStorageHealthAlert,
	storageHealthAlertSchema,
	type StorageHealthAlert,
	type StorageHealthAlertPayload
} from "./storage-health";

export const diagnosticsPreferenceRecordSchema = z.object({
	id: z.string().uuid().default(() => randomUUID()),
	highContrastEnabled: z.boolean().default(false),
	reducedMotionEnabled: z.boolean().default(false),
	remoteProvidersEnabled: z.boolean().default(false),
	lastUpdatedAt: z.string().datetime(),
	updatedBy: z.enum(["renderer", "backend", "main"]),
	consentSummary: z.string().min(1).max(240),
	consentEvents: z
		.array(consentEventLogSchema)
		.max(CONSENT_EVENT_WINDOW)
		.default([]),
	storageHealth: storageHealthAlertSchema.nullable().default(null)
});

export type DiagnosticsPreferenceRecordPayload = z.infer<typeof diagnosticsPreferenceRecordSchema>;

export interface DiagnosticsPreferenceRecord {
	id: string;
	highContrastEnabled: boolean;
	reducedMotionEnabled: boolean;
	remoteProvidersEnabled: boolean;
	lastUpdatedAt: Date;
	updatedBy: "renderer" | "backend" | "main";
	consentSummary: string;
	consentEvents: ConsentEventLog[];
	storageHealth: StorageHealthAlert | null;
}

export interface DiagnosticsPreferenceUpdate {
	highContrastEnabled: boolean;
	reducedMotionEnabled: boolean;
	remoteProvidersEnabled: boolean;
	consentSummary: string;
	updatedBy: DiagnosticsPreferenceRecord["updatedBy"];
	expectedLastUpdatedAt?: string | Date;
	consentEvent?: ConsentEventLog | ConsentEventLogPayload;
}

export function parseDiagnosticsPreferenceRecord(input: unknown): DiagnosticsPreferenceRecord {
	const payload = diagnosticsPreferenceRecordSchema.parse(input);
	return {
		id: payload.id,
		highContrastEnabled: payload.highContrastEnabled,
		reducedMotionEnabled: payload.reducedMotionEnabled,
		remoteProvidersEnabled: payload.remoteProvidersEnabled,
		lastUpdatedAt: new Date(payload.lastUpdatedAt),
		updatedBy: payload.updatedBy,
		consentSummary: payload.consentSummary,
		consentEvents: normalizeConsentEvents(payload.consentEvents),
		storageHealth: payload.storageHealth ? parseStorageHealthAlert(payload.storageHealth) : null
	};
}

export function serializeDiagnosticsPreferenceRecord(
	record: DiagnosticsPreferenceRecord
): DiagnosticsPreferenceRecordPayload {
	return {
		id: record.id,
		highContrastEnabled: record.highContrastEnabled,
		reducedMotionEnabled: record.reducedMotionEnabled,
		remoteProvidersEnabled: record.remoteProvidersEnabled,
		lastUpdatedAt: record.lastUpdatedAt.toISOString(),
		updatedBy: record.updatedBy,
		consentSummary: record.consentSummary,
		consentEvents: record.consentEvents.map(serializeConsentEventLog),
		storageHealth: record.storageHealth ? serializeStorageHealthAlert(record.storageHealth) : null
	};
}

export function applyConsentEvent(
	record: DiagnosticsPreferenceRecord,
	event: ConsentEventLog | ConsentEventLogPayload
): DiagnosticsPreferenceRecord {
	const nextEvents = appendConsentEvent(record.consentEvents, event);
	return {
		...record,
		consentEvents: nextEvents
	};
}

export function withStorageHealth(
	record: DiagnosticsPreferenceRecord,
	alert: StorageHealthAlert | StorageHealthAlertPayload | null
): DiagnosticsPreferenceRecord {
	const resolved = alert ? (isStorageHealthAlert(alert) ? alert : parseStorageHealthAlert(alert)) : null;
	return {
		...record,
		storageHealth: resolved
	};
}

function isStorageHealthAlert(
	value: StorageHealthAlert | StorageHealthAlertPayload
): value is StorageHealthAlert {
	return value.detectedAt instanceof Date;
}

export function createDiagnosticsPreferenceRecord(
	overrides: Partial<Omit<DiagnosticsPreferenceRecord, "lastUpdatedAt" | "consentEvents">> & {
		lastUpdatedAt?: Date;
		consentEvents?: ReadonlyArray<ConsentEventLog | ConsentEventLogPayload>;
	} = {}
): DiagnosticsPreferenceRecord {
	return {
		id: overrides.id ?? randomUUID(),
		highContrastEnabled: overrides.highContrastEnabled ?? false,
		reducedMotionEnabled: overrides.reducedMotionEnabled ?? false,
		remoteProvidersEnabled: overrides.remoteProvidersEnabled ?? false,
		lastUpdatedAt: overrides.lastUpdatedAt ?? new Date(),
		updatedBy: overrides.updatedBy ?? "main",
		consentSummary: overrides.consentSummary ?? "Remote providers are disabled",
		consentEvents: normalizeConsentEvents(overrides.consentEvents ?? []),
		storageHealth: overrides.storageHealth ?? null
	};
}

export function updateDiagnosticsPreferenceRecord(
	record: DiagnosticsPreferenceRecord,
	update: DiagnosticsPreferenceUpdate
): DiagnosticsPreferenceRecord {
	let consentEvents = record.consentEvents;
	if (update.consentEvent) {
		consentEvents = appendConsentEvent(consentEvents, update.consentEvent);
	}

	return {
		...record,
		highContrastEnabled: update.highContrastEnabled,
		reducedMotionEnabled: update.reducedMotionEnabled,
		remoteProvidersEnabled: update.remoteProvidersEnabled,
		consentSummary: update.consentSummary,
		updatedBy: update.updatedBy,
		lastUpdatedAt: new Date(),
		consentEvents,
		storageHealth: record.storageHealth
	};
}

export function createStorageFailureAlert(
	reason: StorageHealthAlert["reason"],
	message: string
): StorageHealthAlert {
	return createStorageHealthAlert({
		reason,
		message,
		status: "unavailable"
	});
}
