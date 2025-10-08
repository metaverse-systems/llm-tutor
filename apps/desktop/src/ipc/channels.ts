export const DIAGNOSTICS_CHANNELS = {
	getState: "diagnostics:get-state",
	getSummary: "diagnostics:get-summary",
	refresh: "diagnostics:refresh",
	openLogDirectory: "diagnostics:open-log-directory",
	getProcessEvents: "diagnostics:get-process-events",
	exportSnapshot: "diagnostics:export-snapshot",
	preferencesUpdate: "diagnostics:preferences:update",
	preferencesUpdated: "diagnostics:preferences:updated",
	preferencesStorageHealth: "diagnostics:preferences:storage-health",
	backendStateChanged: "diagnostics:backend-state-changed",
	processEvent: "diagnostics:process-event",
	retentionWarning: "diagnostics:retention-warning",
	snapshotUpdated: "diagnostics:snapshot-updated"
} as const;

export type DiagnosticsChannels = typeof DIAGNOSTICS_CHANNELS;
