import type {
	DiagnosticsAccessibilityStateLog,
	DiagnosticsExportLogEntry
} from "@metaverse-systems/llm-tutor-shared";
import { app } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const EXPORT_LOG_BASENAME = (options: { suffix?: string } = {}) => {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "");
	const suffix = options.suffix ? `-${options.suffix}` : "";
	return `diagnostics-snapshot${suffix}-export-${timestamp}.log.jsonl`;
};

export type AccessibilityStateLog = DiagnosticsAccessibilityStateLog;

export type ExportLogEntry = DiagnosticsExportLogEntry;

export interface ExportLogContext {
	exportDirectory?: string;
	logDirectory?: string;
	logger?: Pick<Console, "info" | "warn" | "error">;
}

export function resolveLogDirectory(context: ExportLogContext = {}): string {
	if (context.logDirectory) {
		return context.logDirectory;
	}

	if (context.exportDirectory) {
		return context.exportDirectory;
	}

	const userData = app.getPath("userData");
	return path.join(userData, "diagnostics", "exports");
}

async function ensureDirectory(target: string) {
	await fs.mkdir(target, { recursive: true, mode: 0o700 });
}

async function writeJsonlLine(filePath: string, payload: unknown) {
	const serialized = JSON.stringify(payload);
	await fs.appendFile(filePath, `${serialized}${os.EOL}`);
}

export interface PrepareExportLogOptions extends ExportLogContext {
	suffix?: string;
}

export interface ExportLogHandle {
	readonly filePath: string;
	write(entry: ExportLogEntry): Promise<void>;
}

export async function prepareExportLog(
	options: PrepareExportLogOptions = {}
): Promise<ExportLogHandle> {
	const { logger = console } = options;
	const directory = resolveLogDirectory(options);
	await ensureDirectory(directory);

	const fileName = EXPORT_LOG_BASENAME({ suffix: options.suffix });
	const filePath = path.join(directory, fileName);

	try {
		await fs.writeFile(filePath, "", { flag: "wx", mode: 0o600 });
	} catch (error) {
		logger.warn?.("Failed to create diagnostics export log file", error);
		throw error;
	}

	return {
		filePath,
		async write(entry) {
			const enrichedEntry: ExportLogEntry = {
				...entry,
				timestamp: entry.timestamp ?? new Date().toISOString()
			};
			await writeJsonlLine(filePath, enrichedEntry);
		}
	};
}
