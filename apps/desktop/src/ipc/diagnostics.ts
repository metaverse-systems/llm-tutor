import type { IpcMain, WebContents } from "electron";
import type {
	DiagnosticsSnapshotPayload,
	ProcessHealthEventPayload
} from "@metaverse-systems/llm-tutor-shared";
import { createProcessHealthEventPayload } from "@metaverse-systems/llm-tutor-shared";
import type { BackendProcessState, DiagnosticsManager, DiagnosticsRefreshResult } from "../main/diagnostics";

export const DIAGNOSTICS_CHANNELS = {
	getState: "diagnostics:get-state",
	getSummary: "diagnostics:get-summary",
	refresh: "diagnostics:refresh",
	openLogDirectory: "diagnostics:open-log-directory",
	getProcessEvents: "diagnostics:get-process-events",
	backendStateChanged: "diagnostics:backend-state-changed",
	processEvent: "diagnostics:process-event",
	retentionWarning: "diagnostics:retention-warning",
	snapshotUpdated: "diagnostics:snapshot-updated"
} as const;

export type DiagnosticsChannels = typeof DIAGNOSTICS_CHANNELS;

export interface SerializableBackendProcessState
	extends Omit<BackendProcessState, "updatedAt"> {
	updatedAt: string;
}

export interface DiagnosticsStatePayload {
	backend: SerializableBackendProcessState;
	warnings: string[];
	latestSnapshot: DiagnosticsSnapshotPayload | null | undefined;
	processEvents: ProcessHealthEventPayload[];
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
			processEvents: manager.getProcessEventPayloads()
		};
	});
	ipcMain.handle(DIAGNOSTICS_CHANNELS.getProcessEvents, async () => manager.getProcessEventPayloads());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.getSummary, async () => manager.fetchLatestSnapshot());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.refresh, async () => manager.refreshSnapshot());
	ipcMain.handle(DIAGNOSTICS_CHANNELS.openLogDirectory, async () => manager.openDiagnosticsDirectory());

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

	manager.on("backend-state-changed", handleBackendStateChanged);
	manager.on("process-event", handleProcessEvent);
	manager.on("retention-warning", handleRetentionWarning);
	manager.on("snapshot-updated", handleSnapshotUpdated);

	return {
		emitInitialState: () => {
			const contents = getWebContents();
			if (!contents) {
				return;
			}

			const state = manager.getState();
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.backendStateChanged, serializeBackendState(state.backend));
			sendToRenderer(contents, DIAGNOSTICS_CHANNELS.snapshotUpdated, state.latestSnapshot ?? null);
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

			manager.off("backend-state-changed", handleBackendStateChanged);
			manager.off("process-event", handleProcessEvent);
			manager.off("retention-warning", handleRetentionWarning);
			manager.off("snapshot-updated", handleSnapshotUpdated);
		}
	};
}
