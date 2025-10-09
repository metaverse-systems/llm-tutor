import {
	createStorageFailureAlert,
	parseDiagnosticsPreferenceRecord,
	serializeDiagnosticsPreferenceRecord,
	serializeStorageHealthAlert,
	updateDiagnosticsPreferenceRecord
} from "@metaverse-systems/llm-tutor-shared";
import type {
	DiagnosticsPreferenceRecord,
	DiagnosticsPreferenceRecordPayload,
	DiagnosticsPreferenceUpdate,
	StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";

export interface DiagnosticsPreferenceUpdateRequest
	extends Omit<DiagnosticsPreferenceUpdate, "updatedBy"> {
	updatedBy?: DiagnosticsPreferenceUpdate["updatedBy"];
}

export interface DiagnosticsPreferenceMutationResult {
	record: DiagnosticsPreferenceRecordPayload;
	storageHealth: StorageHealthAlertPayload | null;
}

export class PreferenceVaultUnavailableError extends Error {
	constructor(public readonly storageHealth: StorageHealthAlertPayload) {
		super("Diagnostics preference vault unavailable");
		this.name = "PreferenceVaultUnavailableError";
	}
}

export class PreferenceConcurrencyError extends Error {
	readonly code = "DIAGNOSTICS_PREFERENCES_STALE" as const;

	constructor() {
		super("Diagnostics preferences have changed since last read");
		this.name = "PreferenceConcurrencyError";
	}
}

export interface DiagnosticsPreferenceAdapter {
	load(): Promise<DiagnosticsPreferenceRecordPayload>;
	update(payload: DiagnosticsPreferenceUpdateRequest): Promise<DiagnosticsPreferenceMutationResult>;
	getStorageHealth(): Promise<StorageHealthAlertPayload | null>;
	seed?(payload: DiagnosticsPreferenceRecordPayload): Promise<void>;
	simulateUnavailable?(): Promise<void>;
	restoreAvailability?(): Promise<void>;
}

interface InMemoryDiagnosticsPreferenceAdapterOptions {
	initialRecord: DiagnosticsPreferenceRecord;
	now?: () => Date;
}

type FailureMode = "ok" | "unavailable";

export function createInMemoryDiagnosticsPreferenceAdapter(
	options: InMemoryDiagnosticsPreferenceAdapterOptions
): DiagnosticsPreferenceAdapter {
	let record = normalizeRecord(options.initialRecord);
	let failureMode: FailureMode = "ok";
	const now = options.now ?? (() => new Date());

	const ensureAvailable = () => {
		if (failureMode !== "unavailable") {
			return;
		}
		const payload = serializeDiagnosticsPreferenceRecord(record);
		const alert = payload.storageHealth ?? serializeStorageHealthAlert(
			createStorageFailureAlert("permission-denied", "Preference vault is unreachable")
		);
		throw new PreferenceVaultUnavailableError(alert);
	};

	return {
		load(): Promise<DiagnosticsPreferenceRecordPayload> {
			ensureAvailable();
			return Promise.resolve(serializeDiagnosticsPreferenceRecord(record));
		},
		update(payload): Promise<DiagnosticsPreferenceMutationResult> {
			ensureAvailable();
			const currentIso = record.lastUpdatedAt.toISOString();
			if (payload.expectedLastUpdatedAt) {
				const expectedIso = new Date(payload.expectedLastUpdatedAt).toISOString();
				if (expectedIso !== currentIso) {
					throw new PreferenceConcurrencyError();
				}
			}

			let next = updateDiagnosticsPreferenceRecord(record, {
				highContrastEnabled: payload.highContrastEnabled,
				reducedMotionEnabled: payload.reducedMotionEnabled,
				remoteProvidersEnabled: payload.remoteProvidersEnabled,
				consentSummary: payload.consentSummary,
				updatedBy: payload.updatedBy ?? "backend",
				expectedLastUpdatedAt: payload.expectedLastUpdatedAt,
				consentEvent: payload.consentEvent
			});

			const proposedUpdatedAt = now();
			const resolvedUpdatedAt =
				proposedUpdatedAt.getTime() <= record.lastUpdatedAt.getTime()
					? new Date(record.lastUpdatedAt.getTime() + 1)
					: proposedUpdatedAt;

			next = {
				...next,
				lastUpdatedAt: resolvedUpdatedAt,
				storageHealth: shouldSimulateFailure(payload)
					? createStorageFailureAlert("disk-full", "Unable to persist preferences to disk")
					: null
			};

			record = normalizeRecord(next);

			return Promise.resolve({
				record: serializeDiagnosticsPreferenceRecord(record),
				storageHealth: record.storageHealth
					? serializeStorageHealthAlert(record.storageHealth)
					: null
			});
		},
		getStorageHealth(): Promise<StorageHealthAlertPayload | null> {
			return Promise.resolve(
				record.storageHealth ? serializeStorageHealthAlert(record.storageHealth) : null
			);
		},
		seed(payload): Promise<void> {
			record = normalizeRecord(parseDiagnosticsPreferenceRecord(payload));
			return Promise.resolve();
		},
		simulateUnavailable(): Promise<void> {
			failureMode = "unavailable";
			record = normalizeRecord({
				...record,
				storageHealth: createStorageFailureAlert(
					"permission-denied",
					"Preferences vault is temporarily unavailable"
				)
			});
			return Promise.resolve();
		},
		restoreAvailability(): Promise<void> {
			failureMode = "ok";
			record = normalizeRecord({
				...record,
				storageHealth: null
			});
			return Promise.resolve();
		}
	};
}

function normalizeRecord(input: DiagnosticsPreferenceRecord): DiagnosticsPreferenceRecord {
	return parseDiagnosticsPreferenceRecord(serializeDiagnosticsPreferenceRecord(input));
}

function shouldSimulateFailure(payload: DiagnosticsPreferenceUpdateRequest): boolean {
	const summary = payload.consentSummary?.toLowerCase() ?? "";
	return summary.includes("simulate storage failure");
}
