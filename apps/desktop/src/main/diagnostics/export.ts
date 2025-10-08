import path from "node:path";
import type { WebContents } from "electron";
import type { DiagnosticsManager, DiagnosticsExportPayload } from "./index";

export interface DiagnosticsExportOptions {
	manager: DiagnosticsManager;
	webContents: WebContents | null;
	logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface DiagnosticsExportResult {
	success: boolean;
	filename?: string;
}

function toDataUrl(payload: DiagnosticsExportPayload): string {
	const base64 = Buffer.from(payload.body, "utf-8").toString("base64");
	return `data:${payload.contentType};base64,${base64}`;
}

export async function exportDiagnosticsSnapshot(
	options: DiagnosticsExportOptions
): Promise<DiagnosticsExportResult> {
	const { manager, webContents, logger = console } = options;
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
	const testExportDir = process.env.LLM_TUTOR_TEST_EXPORT_DIR?.trim();

	const dataUrl = toDataUrl(payload);

	return await new Promise<DiagnosticsExportResult>((resolve) => {
		const handleDownload = (_event: Electron.Event, item: Electron.DownloadItem) => {
			session.removeListener("will-download", handleDownload);

			if (testExportDir) {
				const filename = payload.filename?.trim() || "diagnostics-snapshot.jsonl";
				const destination = path.join(testExportDir, filename);
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

			item.once("done", (_doneEvent, state) => {
				const success = state === "completed";
				if (!success) {
					logger.warn?.(`Diagnostics export did not complete: ${state}`);
				}
				resolve({ success, filename: payload.filename });
			});
		};

		const cleanupOnError = (error: unknown) => {
			session.removeListener("will-download", handleDownload);
			logger.warn?.("Diagnostics export failed to initiate", error);
			resolve({ success: false });
		};

		session.once("will-download", handleDownload);

		try {
			webContents.downloadURL(`${dataUrl}#${encodeURIComponent(payload.filename)}`);
		} catch (error) {
			cleanupOnError(error);
		}
	});
}
