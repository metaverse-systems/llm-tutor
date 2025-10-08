import type { IpcMain, WebContents } from "electron";
import type {
	DiagnosticsPreferenceRecordPayload,
	DiagnosticsSnapshotPayload,
	ProcessHealthEventPayload,
	StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";
import { createProcessHealthEventPayload } from "@metaverse-systems/llm-tutor-shared";
import type { BackendProcessState, DiagnosticsManager, DiagnosticsRefreshResult } from "../main/diagnostics";
import type { PreferencesVaultUpdate } from "../main/diagnostics/preferences/preferencesVault";
import { exportDiagnosticsSnapshot } from "../main/diagnostics/export";
import { DIAGNOSTICS_CHANNELS } from "./channels";
import type { DiagnosticsChannels } from "./channels";

export { DIAGNOSTICS_CHANNELS };
export type { DiagnosticsChannels };

export interface SerializableBackendProcessState
	extends Omit<BackendProcessState, "updatedAt"> {
	updatedAt: string;
}

export interface DiagnosticsStatePayload {
	backend: SerializableBackendProcessState;
	warnings: string[];
	latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
	processEvents: ProcessHealthEventPayload[];
	preferences: DiagnosticsPreferenceRecordPayload | null;
	storageHealth: StorageHealthAlertPayload | null;
}

export interface DiagnosticsRefreshResponse extends DiagnosticsRefreshResult {}

export interface RegisterDiagnosticsIpcHandlersOptions {
	ipcMain: IpcMain;
	manager: DiagnosticsManager;
	getWebContents: () => WebContents | null;
}

export interface DiagnosticsIpcRegistration {
	emitInitialState: () => void;
	dispose: () => void;
}

function sendToRenderer(contents: WebContents | null, channel: string, payload: unknown): void {
	if (!contents) {
		return;
	}
	contents.send(channel, payload);
}

function serializeBackendState(state: BackendProcessState): SerializableBackendProcessState {
	let updatedAt: string;
	if (state.updatedAt instanceof Date) {
		updatedAt = state.updatedAt.toISOString();
	} else {
		const parsed = new Date(state.updatedAt as unknown as string);
		updatedAt = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
	}
	return {
		...state,
		updatedAt
	};
}

function normalizePreferencesUpdatePayload(input: unknown): PreferencesVaultUpdate {
	if (!input || typeof input !== "object") {
		throw new TypeError("Diagnostics preference update payload must be an object");
	}

	const candidate = input as Record<string, unknown>;
	const { updatedBy } = candidate;
	if (updatedBy !== "renderer" && updatedBy !== "backend" && updatedBy !== "main") {
		throw new TypeError("Diagnostics preference update requires a valid updatedBy identifier");
	}

	const expectedBoolean = (value: unknown, field: string): boolean => {
		if (typeof value !== "boolean") {
			throw new TypeError(`${field} must be a boolean`);
		}
		return value;
	};

	const expectedString = (value: unknown, field: string): string => {
		if (typeof value !== "string" || !value.trim()) {
			throw new TypeError(`${field} must be a non-empty string`);
		}
		return value;
	};

	const payload: PreferencesVaultUpdate = {
		highContrastEnabled: expectedBoolean(candidate.highContrastEnabled, "highContrastEnabled"),
		reducedMotionEnabled: expectedBoolean(candidate.reducedMotionEnabled, "reducedMotionEnabled"),
		remoteProvidersEnabled: expectedBoolean(candidate.remoteProvidersEnabled, "remoteProvidersEnabled"),
		consentSummary: expectedString(candidate.consentSummary, "consentSummary"),
		updatedBy,
		expectedLastUpdatedAt: undefined,
		consentEvent: candidate.consentEvent as PreferencesVaultUpdate["consentEvent"]
	};

	if (candidate.expectedLastUpdatedAt !== undefined && candidate.expectedLastUpdatedAt !== null) {
		const allowedTypes = typeof candidate.expectedLastUpdatedAt === "string" || candidate.expectedLastUpdatedAt instanceof Date;
		if (!allowedTypes) {
			throw new TypeError("expectedLastUpdatedAt must be a string or Date when provided");
		}
		payload.expectedLastUpdatedAt = candidate.expectedLastUpdatedAt as PreferencesVaultUpdate["expectedLastUpdatedAt"];
	}

	return payload;
}

export function registerDiagnosticsIpcHandlers(
	options: RegisterDiagnosticsIpcHandlersOptions
): DiagnosticsIpcRegistration {
	const { ipcMain, manager, getWebContents } = options;

	ipcMain.handle(DIAGNOSTICS_CHANNELS.getState, async (): Promise<DiagnosticsStatePayload> => {
		const state = manager.getState();
		return {
			backend: serializeBackendState(state.backend),
			warnings: state.warnings,
			latestSnapshot: state.latestSnapshot ?? null,
			processEvents: manager.getProcessEventPayloads(),
			preferences: state.preferences ?? null,
			storageHealth: state.storageHealth ?? null
		};
	});
	ipcMain.handle(DIAGNOSTICS_CHANNELS.getProcessEvents, async () => manager.getProcessEventPayloads());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.getSummary, async () => manager.fetchLatestSnapshot());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.refresh, async () => manager.refreshSnapshot());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.openLogDirectory, async () => manager.openDiagnosticsDirectory());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.exportSnapshot, async () =>
		exportDiagnosticsSnapshot({
			manager,
			webContents: getWebContents()
		})
	);
	ipcMain.handle(DIAGNOSTICS_CHANNELS.preferencesUpdate, async (_event, payload) => {
		const normalized = normalizePreferencesUpdatePayload(payload);
		return manager.updatePreferences(normalized);
	});

	const handleBackendStateChanged = (state: BackendProcessState) => {
		sendToRenderer(
			getWebContents(),
			DIAGNOSTICS_CHANNELS.backendStateChanged,
			serializeBackendState(state)
		);
	};

	const handleProcessEvent = (event: Parameters<typeof createProcessHealthEventPayload>[0]) => {
		const payload: ProcessHealthEventPayload = createProcessHealthEventPayload(event);
		sendToRenderer(getWebContents(), DIAGNOSTICS_CHANNELS.processEvent, payload);
	};

	const handleRetentionWarning = (message: string) => {
		sendToRenderer(getWebContents(), DIAGNOSTICS_CHANNELS.retentionWarning, message);
	};

	const handleSnapshotUpdated = (snapshot: DiagnosticsSnapshotPayload | null) => {
		sendToRenderer(getWebContents(), DIAGNOSTICS_CHANNELS.snapshotUpdated, snapshot);
	};

	const handlePreferencesUpdated = (payload: DiagnosticsPreferenceRecordPayload) => {
		sendToRenderer(getWebContents(), DIAGNOSTICS_CHANNELS.preferencesUpdated, payload);
	};

	const handlePreferencesStorageHealth = (payload: StorageHealthAlertPayload | null) => {
		sendToRenderer(getWebContents(), DIAGNOSTICS_CHANNELS.preferencesStorageHealth, payload);
	};

	manager.on("backend-state-changed", handleBackendStateChanged);
	manager.on("process-event", handleProcessEvent);
	manager.on("retention-warning", handleRetentionWarning);
	manager.on("snapshot-updated", handleSnapshotUpdated);
	manager.on("preferences-updated", handlePreferencesUpdated);
	manager.on("preferences-storage-health", handlePreferencesStorageHealth);

	return {
		emitInitialState: () => {
			const contents = getWebContents();
			if (!contents) {
				return;
			}

			const state = manager.getState();
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.backendStateChanged, serializeBackendState(state.backend));
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.snapshotUpdated, state.latestSnapshot ?? null);
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.preferencesUpdated, state.preferences ?? null);
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.preferencesStorageHealth, state.storageHealth ?? null);
			for (const warning of state.warnings) {
				sendToRenderer(contents, DIAGNOSTICS_CHANNELS.retentionWarning, warning);
			}
			for (const event of manager.getProcessEventPayloads()) {
				sendToRenderer(contents, DIAGNOSTICS_CHANNELS.processEvent, event);
			}
		},
		dispose: () => {
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.getState);
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.getProcessEvents);
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.getSummary);
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.refresh);
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.openLogDirectory);
			ipcMain.removeHandler(DIAGNOSTICS_CHANNELS.preferencesUpdate);

			manager.off("backend-state-changed", handleBackendStateChanged);
			manager.off("process-event", handleProcessEvent);
			manager.off("retention-warning", handleRetentionWarning);
			manager.off("snapshot-updated", handleSnapshotUpdated);
			manager.off("preferences-updated", handlePreferencesUpdated);
			manager.off("preferences-storage-health", handlePreferencesStorageHealth);
		}
	};
}
