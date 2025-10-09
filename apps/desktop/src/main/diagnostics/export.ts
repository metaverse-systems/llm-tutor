import type { StorageHealthAlertPayload } from "@metaverse-systems/llm-tutor-shared";
import type { WebContents } from "electron";
import path from "node:path";

import type { DiagnosticsManager, DiagnosticsExportPayload, DiagnosticsManagerState } from "./index";
import {
	prepareExportLog,
	type AccessibilityStateLog,
	type ExportLogEntry,
	type ExportLogHandle
} from "../logging/exportLog";

export interface DiagnosticsExportOptions {
	manager: DiagnosticsManager;
	webContents: WebContents | null;
	logger?: Pick<Console, "info" | "warn" | "error">;
	accessibilityState?: AccessibilityStateLog;
}

export interface DiagnosticsExportResult {
	success: boolean;
	filename?: string;
	logPath?: string;
}

function toDataUrl(payload: DiagnosticsExportPayload): string {
	const base64 = Buffer.from(payload.body, "utf-8").toString("base64");
	return `data:${payload.contentType};base64,${base64}`;
}

export async function exportDiagnosticsSnapshot(
	options: DiagnosticsExportOptions
): Promise<DiagnosticsExportResult> {
	const { manager, webContents, logger = console, accessibilityState } = options;
	if (!webContents) {
		logger.warn?.("Diagnostics export requested without an active window");
		return { success: false };
	}

	const payload = await manager.exportSnapshot();
	if (!payload) {
		logger.warn?.("Diagnostics export skipped because no snapshot is available");
		return { success: false };
	}

	const session = webContents.session;
	const testExportDir = process.env.LLM_TUTOR_TEST_EXPORT_DIR?.trim() || undefined;
	const storageAlert = formatStorageAlertsSafely(manager);
	const snapshotId = pickSnapshotId(manager);
	const resolvedAccessibilityState = deriveAccessibilityState(manager, accessibilityState);
	const exportTestMode = process.env.LLM_TUTOR_TEST_EXPORT_MODE?.trim().toLowerCase() ?? "";
	const forcePermissionDenied = exportTestMode === "permission-denied";

	let logHandle: ExportLogHandle | null = null;
	try {
		logHandle = await prepareExportLog({
			exportDirectory: testExportDir,
			suffix: payload.filename.replace(/[^a-z0-9-]/gi, "-") || undefined,
			logger
		});
	} catch (error) {
		logger.warn?.("Diagnostics export will continue without log file", error);
	}

	const dataUrl = toDataUrl(payload);

	return await new Promise<DiagnosticsExportResult>((resolve) => {
		const handleDownload = (_event: Electron.Event, item: Electron.DownloadItem) => {
			session.removeListener("will-download", handleDownload);
			const sanitizedFilename = sanitizeFilename(payload.filename);

			if (testExportDir) {
				const destination = path.join(testExportDir, sanitizedFilename);
				try {
					item.setSavePath(destination);
				} catch (error) {
					logger.warn?.("Failed to assign diagnostics export save path", error);
				}
			}

			if (typeof item.setSaveDialogOptions === "function") {
				item.setSaveDialogOptions({
					title: "Save diagnostics snapshot",
					defaultPath: payload.filename,
					showsTagField: false
				});
			}

			let forcedFailureContext: string | null = null;
			if (forcePermissionDenied) {
				forcedFailureContext = "Permission denied while writing diagnostics export (simulated)";
			}

			item.once("done", (_doneEvent, state) => {
				void (async () => {
					const success = state === "completed";
					if (!success) {
						logger.warn?.(`Diagnostics export did not complete: ${state}`);
					}

					const savePath = item.getSavePath?.();
					const exportPath = testExportDir
						? path.join(testExportDir, sanitizedFilename)
						: savePath ?? sanitizedFilename;

					if (logHandle) {
						const entry: ExportLogEntry = {
							status: success ? "success" : "failure",
							exportPath,
							snapshotId,
							accessibilityState: resolvedAccessibilityState,
							messages: success
								? buildSuccessMessages(exportPath)
								: buildFailureMessages(state, exportPath, forcedFailureContext ?? undefined),
							storageAlerts: storageAlert
						};
						try {
							await logHandle.write(entry);
						} catch (error) {
							logger.warn?.("Failed to write diagnostics export log entry", error);
						}
					}

					resolve({ success, filename: payload.filename, logPath: logHandle?.filePath ?? undefined });
				})();
			});

			if (forcePermissionDenied) {
				setImmediate(() => {
					try {
						item.cancel();
					} catch (error) {
						logger.warn?.("Diagnostics export cancellation simulation failed", error);
					}
				});
			}
		};

		const cleanupOnError = async (error: unknown) => {
			session.removeListener("will-download", handleDownload);
			logger.warn?.("Diagnostics export failed to initiate", error);
			if (logHandle) {
				try {
					const entry: ExportLogEntry = {
						status: "failure",
						snapshotId,
						accessibilityState: resolvedAccessibilityState,
						messages: buildInitiationFailureMessages(error),
						storageAlerts: storageAlert
					};
					await logHandle.write(entry);
				} catch (logError) {
					logger.warn?.("Failed to log diagnostics export initiation failure", logError);
				}
			}
			resolve({ success: false });
		};

		session.once("will-download", handleDownload);

		try {
			webContents.downloadURL(`${dataUrl}#${encodeURIComponent(payload.filename)}`);
		} catch (error) {
			void cleanupOnError(error);
		}
	});
}

function formatStorageAlertsSafely(manager: DiagnosticsManager): string[] | undefined {
	if (typeof manager.getStorageHealthAlert !== "function") {
		return undefined;
	}

	const alert = manager.getStorageHealthAlert();
	return formatStorageAlert(alert);
}

function formatStorageAlert(alert: StorageHealthAlertPayload | null): string[] | undefined {
	if (!alert) {
		return undefined;
	}

	const segments = [`status: ${alert.status}`, `message: ${alert.message ?? ""}`];
	if (alert.detectedAt) {
		segments.push(`detectedAt: ${alert.detectedAt}`);
	}
	if (alert.retryAvailableAt) {
		segments.push(`retryAvailableAt: ${alert.retryAvailableAt}`);
	}
	return segments;
}

function pickSnapshotId(manager: DiagnosticsManager): string | undefined {
	const state = safeGetState(manager);
	return state?.latestSnapshot?.id ?? undefined;
}

function deriveAccessibilityState(
	manager: DiagnosticsManager,
	override?: AccessibilityStateLog
): AccessibilityStateLog | undefined {
	const merged: AccessibilityStateLog = override ? { ...override } : {};
	const state = safeGetState(manager);
	const preferences = state?.preferences ?? state?.latestSnapshot?.activePreferences ?? null;

	if (preferences) {
		if (merged.highContrastEnabled === undefined) {
			merged.highContrastEnabled = preferences.highContrastEnabled;
		}
		if (merged.reducedMotionEnabled === undefined) {
			merged.reducedMotionEnabled = preferences.reducedMotionEnabled;
		}
		if (merged.remoteProvidersEnabled === undefined) {
			merged.remoteProvidersEnabled = preferences.remoteProvidersEnabled;
		}
	}

	const hasValues = Object.values(merged).some((value) => value !== undefined);
	return hasValues ? merged : undefined;
}

function safeGetState(manager: DiagnosticsManager): DiagnosticsManagerState | null {
	if (typeof manager.getState === "function") {
		try {
			return manager.getState();
		} catch {
			return null;
		}
	}
	return null;
}

function sanitizeFilename(filename: string): string {
	const trimmed = filename.trim();
	return trimmed.length > 0 ? trimmed : "diagnostics-snapshot.jsonl";
}

function buildSuccessMessages(exportPath?: string | null): string[] {
	const messages = ["Diagnostics export completed successfully"];
	if (exportPath) {
		messages.push(`Saved snapshot to ${exportPath}`);
	}
	return messages;
}

function buildFailureMessages(state: string, exportPath?: string | null, context?: string): string[] {
	const messages = [`Diagnostics export ended with state "${state}"`];
	if (exportPath) {
		messages.push(`Partial file may exist at ${exportPath}`);
	}
	if (context) {
		messages.push(context);
	}
	return messages;
}

function buildInitiationFailureMessages(error: unknown): string[] {
	const messages = ["Diagnostics export failed to initiate"];
	if (error instanceof Error && error.message) {
		messages.push(`Reason: ${error.message}`);
	} else if (typeof error === "string" && error.trim()) {
		messages.push(`Reason: ${error.trim()}`);
	}
	return messages;
}
