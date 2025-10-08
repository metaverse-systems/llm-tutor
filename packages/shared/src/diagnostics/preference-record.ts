import { z } from "zod";
import type { ConsentEventLog, ConsentEventLogPayload } from "./consent-event";
import type { StorageHealthAlert, StorageHealthAlertPayload } from "./storage-health";

export const diagnosticsPreferenceRecordSchema = z.any();

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

export function parseDiagnosticsPreferenceRecord(_input: unknown): DiagnosticsPreferenceRecord {
	throw new Error("parseDiagnosticsPreferenceRecord not implemented");
}

export function serializeDiagnosticsPreferenceRecord(
	_record: DiagnosticsPreferenceRecord
): DiagnosticsPreferenceRecordPayload {
	throw new Error("serializeDiagnosticsPreferenceRecord not implemented");
}

export function applyConsentEvent(
	record: DiagnosticsPreferenceRecord,
	_event: ConsentEventLog | ConsentEventLogPayload
): DiagnosticsPreferenceRecord {
	return record;
}

export function withStorageHealth(
	record: DiagnosticsPreferenceRecord,
	_alert: StorageHealthAlert | StorageHealthAlertPayload | null
): DiagnosticsPreferenceRecord {
	return record;
}
