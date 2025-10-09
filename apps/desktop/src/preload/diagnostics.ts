import type {
	DiagnosticsPreferenceRecordPayload,
	DiagnosticsSnapshotPayload,
	ProcessHealthEventPayload,
	StorageHealthAlertPayload,
	DiagnosticsExportRequestPayload
} from "@metaverse-systems/llm-tutor-shared";
import { ipcRenderer, type IpcRendererEvent } from "electron";

import { DIAGNOSTICS_CHANNELS } from "../ipc/channels";
import type {
	BackendProcessState,
	DiagnosticsRefreshResult
} from "../main/diagnostics";

export interface DiagnosticsExportResult {
	success: boolean;
	filename?: string;
	logPath?: string;
}

export interface DiagnosticsStatePayload {
	backend: BackendProcessState;
	warnings: string[];
	latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
	processEvents: ProcessHealthEventPayload[];
	preferences: DiagnosticsPreferenceRecordPayload | null;
	storageHealth: StorageHealthAlertPayload | null;
}

type Listener<T> = (payload: T) => void;

function subscribe<T>(channel: string, listener: Listener<T>): () => void {
	const handler = (_event: IpcRendererEvent, payload: unknown) => {
		listener(payload as T);
	};
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
}

export interface DiagnosticsRendererBridge {
	getState(): Promise<DiagnosticsStatePayload>;
	getProcessEvents(): Promise<ProcessHealthEventPayload[]>;
	requestSummary(): Promise<DiagnosticsSnapshotPayload | null>;
	refreshSnapshot(): Promise<DiagnosticsRefreshResult>;
	openLogDirectory(): Promise<boolean>;
	exportSnapshot(payload?: DiagnosticsExportRequestPayload): Promise<DiagnosticsExportResult>;
	updatePreferences(
		payload: DiagnosticsPreferenceUpdateRequest
	): Promise<DiagnosticsPreferenceRecordPayload>;
	onBackendStateChanged(listener: Listener<BackendProcessState>): () => void;
	onProcessEvent(listener: Listener<ProcessHealthEventPayload>): () => void;
	onRetentionWarning(listener: Listener<string>): () => void;
	onSnapshotUpdated(listener: Listener<DiagnosticsSnapshotPayload | null>): () => void;
	onPreferencesUpdated(listener: Listener<DiagnosticsPreferenceRecordPayload>): () => void;
	onStorageHealthChanged(listener: Listener<StorageHealthAlertPayload | null>): () => void;
}

export interface DiagnosticsPreferenceUpdateRequest {
	highContrastEnabled: boolean;
	reducedMotionEnabled: boolean;
	remoteProvidersEnabled: boolean;
	consentSummary: string;
	expectedLastUpdatedAt?: string;
	consentEvent?: unknown;
}

export function createDiagnosticsBridge(): DiagnosticsRendererBridge {
	return {
		async getState() {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.getState) as Promise<DiagnosticsStatePayload>;
		},
		async getProcessEvents() {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.getProcessEvents) as Promise<ProcessHealthEventPayload[]>;
		},
		async requestSummary() {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.getSummary) as Promise<DiagnosticsSnapshotPayload | null>;
		},
		async refreshSnapshot() {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.refresh) as Promise<DiagnosticsRefreshResult>;
		},
		async openLogDirectory() {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.openLogDirectory) as Promise<boolean>;
		},
		exportSnapshot(payload) {
			return ipcRenderer.invoke(
				DIAGNOSTICS_CHANNELS.exportSnapshot,
				payload ?? {}
			) as Promise<DiagnosticsExportResult>;
		},
		updatePreferences(payload) {
			return ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.preferencesUpdate, {
				...payload,
				updatedBy: "renderer"
			}) as Promise<DiagnosticsPreferenceRecordPayload>;
		},
		onBackendStateChanged(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.backendStateChanged, listener);
		},
		onProcessEvent(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.processEvent, listener);
		},
		onRetentionWarning(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.retentionWarning, listener);
		},
		onSnapshotUpdated(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.snapshotUpdated, listener);
		},
		onPreferencesUpdated(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.preferencesUpdated, listener);
		},
		onStorageHealthChanged(listener) {
			return subscribe(DIAGNOSTICS_CHANNELS.preferencesStorageHealth, listener);
		}
	};
}

export type DiagnosticsPreloadApi = DiagnosticsRendererBridge;
