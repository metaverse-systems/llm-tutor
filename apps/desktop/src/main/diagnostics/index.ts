import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { app, dialog, shell } from "electron";
import net from "node:net";
import type { BrowserWindow } from "electron";
import type {
	DiagnosticsSnapshotPayload,
	ProcessHealthEvent,
	ProcessHealthEventPayload,
	DiagnosticsPreferenceRecordPayload,
	StorageHealthAlertPayload,
	ConsentEventLog,
	ConsentEventLogPayload
} from "@metaverse-systems/llm-tutor-shared";
import {
	createProcessHealthEventPayload,
	parseConsentEventLog,
	serializeConsentEventLog
} from "@metaverse-systems/llm-tutor-shared";
import {
	PreferencesVault,
	type PreferencesVaultOptions,
	type PreferencesVaultUpdate
} from "./preferences/preferencesVault";

export type BackendLifecycleState = "stopped" | "starting" | "running" | "error";

export interface BackendProcessState {
	status: BackendLifecycleState;
	message?: string;
	pid?: number;
	lastExitCode?: number | null;
	lastExitSignal?: NodeJS.Signals | null;
	updatedAt: Date;
}

interface PreferenceSyncRequest {
	reason: "bootstrap" | "update";
	record: DiagnosticsPreferenceRecordPayload;
	consentEvent?: ConsentEventLogPayload;
}

function normalizeConsentEvent(
	event?: ConsentEventLog | ConsentEventLogPayload
): ConsentEventLogPayload | undefined {
	if (!event) {
		return undefined;
	}
	return serializeConsentEventLog(parseConsentEventLog(event));
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function storageHealthEquals(
	left: StorageHealthAlertPayload | null,
	right: StorageHealthAlertPayload | null
): boolean {
	if (!left && !right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		left.status === right.status &&
		left.reason === right.reason &&
		left.detectedAt === right.detectedAt &&
		left.message === right.message &&
		left.retryAvailableAt === right.retryAvailableAt
	);
}

interface BackendLockPayload {
	ownerPid: number;
	childPid?: number | null;
	createdAt: string;
}

export interface DiagnosticsManagerState {
	backend: BackendProcessState;
	warnings: string[];
	processEvents: ProcessHealthEvent[];
	latestSnapshot?: DiagnosticsSnapshotPayload | null;
	preferences?: DiagnosticsPreferenceRecordPayload | null;
	storageHealth?: StorageHealthAlertPayload | null;
}

export interface DiagnosticsExportPayload {
	filename: string;
	contentType: string;
	body: string;
}

interface DiagnosticsManagerEvents {
	"backend-state-changed": (state: BackendProcessState) => void;
	"process-event": (event: ProcessHealthEvent) => void;
	"retention-warning": (message: string) => void;
	"backend-error": (error: { message: string }) => void;
	"snapshot-updated": (snapshot: DiagnosticsSnapshotPayload | null) => void;
	"preferences-updated": (payload: DiagnosticsPreferenceRecordPayload) => void;
	"preferences-storage-health": (payload: StorageHealthAlertPayload | null) => void;
}

type EventKeys = keyof DiagnosticsManagerEvents;

const MAX_PROCESS_EVENTS = 50;

function formatCrashMessage(code: number | null, signal: NodeJS.Signals | null): string {
	if (code !== null) {
		return `Backend process exited with code ${code}`;
	}

	if (signal) {
		return `Backend process terminated due to signal ${signal}`;
	}

	return "Backend process exited unexpectedly";
}

function ensureDirectoryExists(target: string): void {
	if (!existsSync(target)) {
		mkdirSync(target, { recursive: true });
	}
}

class TypedEventEmitter extends EventEmitter {
	on<U extends EventKeys>(event: U, listener: DiagnosticsManagerEvents[U]): this {
		return super.on(event, listener);
	}

	off<U extends EventKeys>(event: U, listener: DiagnosticsManagerEvents[U]): this {
		return super.off(event, listener);
	}

	emit<U extends EventKeys>(event: U, ...args: Parameters<DiagnosticsManagerEvents[U]>): boolean {
		return super.emit(event, ...args);
	}
}

export interface DiagnosticsManagerOptions {
	resolveBackendEntry: () => string | null;
	getLogger?: () => Pick<Console, "log" | "warn" | "error">;
	getMainWindow?: () => BrowserWindow | null;
	diagnosticsApiOrigin?: string;
	createPreferencesVault?: (options: PreferencesVaultOptions) => PreferencesVault;
}

export interface DiagnosticsErrorPayload {
	errorCode: string;
	message: string;
	retryAfterSeconds?: number;
}

export interface DiagnosticsRefreshResult {
	success: boolean;
	snapshot?: DiagnosticsSnapshotPayload;
	error?: DiagnosticsErrorPayload;
}

export class DiagnosticsManager extends TypedEventEmitter {
	private backendProcess: ChildProcess | null = null;
	private backendState: BackendProcessState = {
		status: "stopped",
		message: "Backend not started",
		updatedAt: new Date()
	};
	private processEvents: ProcessHealthEvent[] = [];
	private retentionWarnings: string[] = [];
	private latestSnapshot: DiagnosticsSnapshotPayload | null = null;
	private diagnosticsDirectory: string | null = null;
	private readonly diagnosticsApiOrigin: string;
	private readonly fetchTimeoutMs = 5000;
	private readonly preferencesVault: PreferencesVault;
	private latestPreferences: DiagnosticsPreferenceRecordPayload | null = null;
	private latestStorageHealth: StorageHealthAlertPayload | null = null;
	private preferenceSyncTask: Promise<void> = Promise.resolve();
	private preferenceDisposers: Array<() => void> = [];
	private isShuttingDown = false;
	private backendLockPath: string | null = null;
	private readonly handleVaultUpdated = (payload: DiagnosticsPreferenceRecordPayload) => {
		this.latestPreferences = {
			...payload,
			consentEvents: [...payload.consentEvents],
			storageHealth: payload.storageHealth ? { ...payload.storageHealth } : null
		};
		this.updateStorageHealth(payload.storageHealth ?? null);
		const snapshot = this.getPreferencesRecord();
		if (snapshot) {
			this.emit("preferences-updated", snapshot);
		}
	};
	private readonly handleVaultStorageHealth = (payload: DiagnosticsPreferenceRecordPayload) => {
		this.updateStorageHealth(payload.storageHealth ?? null);
	};

	constructor(private readonly options: DiagnosticsManagerOptions) {
		super();
		this.diagnosticsApiOrigin = options.diagnosticsApiOrigin ?? process.env.DIAGNOSTICS_API_ORIGIN ?? "http://127.0.0.1:4319";
		const vaultOptions: PreferencesVaultOptions = {
			logger: this.options.getLogger?.()
		};
		this.preferencesVault = this.options.createPreferencesVault
			? this.options.createPreferencesVault(vaultOptions)
			: new PreferencesVault(vaultOptions);
		this.preferenceDisposers = [
			this.preferencesVault.on("updated", this.handleVaultUpdated),
			this.preferencesVault.on("storage-health", this.handleVaultStorageHealth)
		];
	}

	async initialize(): Promise<void> {
		this.ensureDiagnosticsDirectory();
		await this.preferencesVault.bootstrap();
		this.updateStorageHealth(this.preferencesVault.getStorageHealth(), { force: true });
		await this.startBackendProcess();
		const currentPreferences = this.getPreferencesRecord();
		if (currentPreferences) {
			this.queuePreferenceSync({
				reason: "bootstrap",
				record: currentPreferences
			});
		}
		void this.fetchLatestSnapshot().catch(() => null);
	}

	async shutdown(): Promise<void> {
		this.isShuttingDown = true;
		for (const dispose of this.preferenceDisposers) {
			try {
				dispose();
			} catch (error) {
				this.options.getLogger?.().warn?.("Failed to dispose diagnostics preference listener", error);
			}
		}
		this.preferenceDisposers = [];
		try {
			await this.preferenceSyncTask;
		} catch (error) {
			this.options.getLogger?.().warn?.("Pending diagnostics preference sync did not complete", error);
		}
		await this.stopBackendProcess();
	}

	getDiagnosticsDirectory(): string {
		return this.ensureDiagnosticsDirectory();
	}

	getState(): DiagnosticsManagerState {
		return {
			backend: { ...this.backendState },
			warnings: [...this.retentionWarnings],
			processEvents: [...this.processEvents],
			latestSnapshot: this.latestSnapshot,
			preferences: this.getPreferencesRecord(),
			storageHealth: this.getStorageHealthAlert()
		};
	}

	getPreferencesRecord(): DiagnosticsPreferenceRecordPayload | null {
		if (!this.latestPreferences) {
			return null;
		}

		return {
			...this.latestPreferences,
			consentEvents: [...this.latestPreferences.consentEvents]
		};
	}

	getStorageHealthAlert(): StorageHealthAlertPayload | null {
		if (!this.latestStorageHealth) {
			return null;
		}

		return { ...this.latestStorageHealth };
	}

	async updatePreferences(update: PreferencesVaultUpdate): Promise<DiagnosticsPreferenceRecordPayload> {
		const consentEvent = normalizeConsentEvent(update.consentEvent);
		const result = await this.preferencesVault.updatePreferences(update);
		this.queuePreferenceSync({
			reason: "update",
			record: result,
			consentEvent
		});
		return {
			...result,
			consentEvents: [...result.consentEvents]
		};
	}

	getProcessEventPayloads(): ProcessHealthEventPayload[] {
		return this.processEvents.map((event) => createProcessHealthEventPayload(event));
	}

	setLatestSnapshot(snapshot: DiagnosticsSnapshotPayload | null): void {
		this.latestSnapshot = snapshot;
		this.emit("snapshot-updated", snapshot);
	}

	async fetchLatestSnapshot(): Promise<DiagnosticsSnapshotPayload | null> {
		const payload = await this.fetchSummaryFromBackend();
		if (payload) {
			this.setLatestSnapshot(payload);
		}
		return payload ?? this.latestSnapshot;
	}

	async refreshSnapshot(): Promise<DiagnosticsRefreshResult> {
		const result = await this.refreshSnapshotFromBackend();
		if (result.success && result.snapshot) {
			this.setLatestSnapshot(result.snapshot);
		}
		return result;
	}

	async exportSnapshot(): Promise<DiagnosticsExportPayload | null> {
		try {
			const response = await this.performFetch("/internal/diagnostics/export", {
				method: "GET"
			});

			if (response.status === 204) {
				return this.ensureFallbackExport();
			}

			if (!response.ok) {
				this.options.getLogger?.().warn?.(
					`Diagnostics export request failed: ${response.status}`
				);
				return this.ensureFallbackExport();
			}

			const body = await response.text();
			const contentType = response.headers.get("content-type") ?? "application/x-ndjson";
			const filename = this.extractFilename(response) ?? this.buildExportFilename(new Date());

			if (!body.trim()) {
				return this.ensureFallbackExport();
			}

			return {
				filename,
				contentType,
				body
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.options.getLogger?.().warn?.(`Diagnostics export failed: ${message}`);
			return this.ensureFallbackExport();
		}
	}

	addRetentionWarning(message: string): void {
		const normalized = message.trim();
		if (!normalized) {
			return;
		}

		this.retentionWarnings = Array.from(new Set([...this.retentionWarnings, normalized]));
		this.emit("retention-warning", normalized);
	}

	clearRetentionWarnings(): void {
		this.retentionWarnings = [];
	}

	async openDiagnosticsDirectory(): Promise<boolean> {
		const directory = this.getDiagnosticsDirectory();
		const result = await shell.openPath(directory);
		if (result) {
			this.options.getLogger?.().warn?.(
				`Failed to open diagnostics directory: ${result}`
			);
			return false;
		}

		return true;
	}

	private ensureDiagnosticsDirectory(): string {
		if (this.diagnosticsDirectory) {
			return this.diagnosticsDirectory;
		}

		const directory = path.join(app.getPath("userData"), "diagnostics");
		try {
			ensureDirectoryExists(directory);
			this.diagnosticsDirectory = directory;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.showErrorDialog(
				"Unable to prepare diagnostics storage",
				`The diagnostics directory could not be created at ${directory}.\n${message}`
			);
			throw error;
		}

		return directory;
	}

	private resolveBackendLockPath(): string {
		if (this.backendLockPath) {
			return this.backendLockPath;
		}

		const override = process.env.LLM_TUTOR_DEV_BACKEND_LOCK?.trim();
		const directory = override && override.length > 0
			? path.resolve(override)
			: path.join(this.ensureDiagnosticsDirectory(), "backend.dev.lock");
		this.backendLockPath = directory;
		return directory;
	}

	private readBackendLock(): BackendLockPayload | null {
		const lockPath = this.resolveBackendLockPath();
		if (!existsSync(lockPath)) {
			return null;
		}
		try {
			const contents = readFileSync(lockPath, "utf-8");
			return JSON.parse(contents) as BackendLockPayload;
		} catch (error) {
			this.options.getLogger?.().warn?.("Failed to read diagnostics backend lock", error);
			return null;
		}
	}

	private writeBackendLock(payload: BackendLockPayload): void {
		const lockPath = this.resolveBackendLockPath();
		try {
			const lockDir = path.dirname(lockPath);
			ensureDirectoryExists(lockDir);
			writeFileSync(lockPath, JSON.stringify(payload, null, 2), "utf-8");
		} catch (error) {
			this.options.getLogger?.().warn?.("Failed to write diagnostics backend lock", error);
		}
	}

	private removeBackendLock(): void {
		const lockPath = this.backendLockPath;
		if (!lockPath || !existsSync(lockPath)) {
			return;
		}
		try {
			const payload = this.readBackendLock();
			if (payload && payload.ownerPid !== process.pid) {
				return;
			}
			rmSync(lockPath, { force: true });
		} catch (error) {
			this.options.getLogger?.().warn?.("Failed to remove diagnostics backend lock", error);
		}
	}

	private isProcessAlive(pid: number | null | undefined): boolean {
		if (!pid || typeof pid !== "number") {
			return false;
		}
		try {
			process.kill(pid, 0);
			return true;
		} catch (error) {
			return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM");
		}
	}

	private getDiagnosticsEndpoint(): { host: string; port: number } {
		try {
			const origin = new URL(this.diagnosticsApiOrigin);
			const port = Number.parseInt(origin.port, 10);
			return {
				host: origin.hostname,
				port: Number.isFinite(port) && port > 0 ? port : origin.protocol === "https:" ? 443 : 80
			};
		} catch (error) {
			this.options.getLogger?.().warn?.("Failed to parse diagnostics API origin", error);
			return { host: "127.0.0.1", port: 4319 };
		}
	}

	private async isBackendPortBusy(host: string, port: number): Promise<boolean> {
		return await new Promise((resolve) => {
			let settled = false;
			const finish = (value: boolean) => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(value);
			};

			const socket = net.createConnection({ host, port }, () => {
				socket.destroy();
				finish(true);
			});

			socket.once("error", (error: NodeJS.ErrnoException) => {
				socket.destroy();
				if (error?.code === "ECONNREFUSED" || error?.code === "ENOENT") {
					finish(false);
					return;
				}
				this.options.getLogger?.().warn?.(
					`Diagnostics backend port probe failed: ${error?.code ?? error?.message ?? error}`
				);
				finish(false);
			});

			socket.setTimeout(500, () => {
				socket.destroy();
				finish(true);
			});
		});
	}

	private async ensureBackendCanStart(): Promise<boolean> {
		if (app.isPackaged) {
			return true;
		}

		const existingLock = this.readBackendLock();
		if (existingLock) {
			const ownerAlive = this.isProcessAlive(existingLock.ownerPid);
			const childAlive = this.isProcessAlive(existingLock.childPid ?? null);
			if (!ownerAlive && !childAlive) {
				this.removeBackendLock();
			} else {
				const lockPath = this.resolveBackendLockPath();
				const message = `Diagnostics backend already managed by PID ${existingLock.ownerPid}.`;
				this.options.getLogger?.().warn?.(message);
				this.updateBackendState({
					status: "error",
					message,
					updatedAt: new Date()
				});
				this.showErrorDialog(
					"Diagnostics backend already running",
					`${message} Stop the existing session or remove the lock file at ${lockPath} before retrying.`
				);
				return false;
			}
		}

		const { host, port } = this.getDiagnosticsEndpoint();
		const busy = await this.isBackendPortBusy(host, port);
		if (busy) {
			const message = `Diagnostics backend port ${host}:${port} is already in use.`;
			this.options.getLogger?.().warn?.(message);
			this.updateBackendState({
				status: "error",
				message: `${message} Stop the other process before launching the desktop shell.`,
				updatedAt: new Date()
			});
			this.showErrorDialog(
				"Diagnostics backend unavailable",
				`${message} Stop the conflicting process or change DIAGNOSTICS_PORT before retrying.`
			);
			return false;
		}

		this.writeBackendLock({
			ownerPid: process.pid,
			childPid: null,
			createdAt: new Date().toISOString()
		});

		return true;
	}

	private async startBackendProcess(): Promise<void> {
		if (this.backendProcess) {
			return;
		}

		const canStart = await this.ensureBackendCanStart();
		if (!canStart) {
			return;
		}

		const managingLock = !app.isPackaged;

		const entry = this.options.resolveBackendEntry();
		if (!entry) {
			if (managingLock) {
				this.removeBackendLock();
			}
			this.updateBackendState({
				status: "error",
				message: "Backend entry point is missing",
				updatedAt: new Date()
			});
			this.showErrorDialog(
				"Backend unavailable",
				"The diagnostics backend could not be located. Check that the backend has been built before launching the desktop app."
			);
			return;
		}

		this.updateBackendState({
			status: "starting",
			message: "Starting diagnostics backend...",
			updatedAt: new Date()
		});

		try {
			const child = fork(entry, [], {
				stdio: "inherit",
				env: {
					...process.env,
					LLM_TUTOR_MODE: app.isPackaged ? "production" : "development"
				}
			});

			this.backendProcess = child;
			child.once("spawn", () => {
				if (managingLock) {
					const existingLock = this.readBackendLock();
					this.writeBackendLock({
						ownerPid: process.pid,
						childPid: child.pid ?? null,
						createdAt: existingLock?.createdAt ?? new Date().toISOString()
					});
				}
				this.recordProcessEvent("spawn", "Backend process spawned", child.pid ?? null);
				this.updateBackendState({
					status: "running",
					message: "Diagnostics backend running",
					pid: child.pid ?? undefined,
					updatedAt: new Date()
				});
			});

			child.on("exit", (code, signal) => {
				if (managingLock) {
					this.removeBackendLock();
				}
				this.backendProcess = null;
				const crash = code !== 0;
				const reason = formatCrashMessage(code, signal);
				this.recordProcessEvent(crash ? "crash" : "exit", reason, code);
				this.updateBackendState({
					status: crash ? "error" : "stopped",
					message: reason,
					lastExitCode: code ?? null,
					lastExitSignal: signal ?? null,
					updatedAt: new Date()
				});

				if (crash) {
					this.emit("backend-error", { message: reason });
					this.showErrorDialog(
						"Diagnostics backend stopped",
						`${reason}. The application will continue running, but diagnostics data may be stale until the backend is restarted.`
					);
				}
			});

			child.on("error", (error) => {
				if (managingLock) {
					this.removeBackendLock();
				}
				const message = error instanceof Error ? error.message : String(error);
				this.recordProcessEvent("crash", message);
				this.updateBackendState({
					status: "error",
					message,
					updatedAt: new Date()
				});
				this.emit("backend-error", { message });
				this.showErrorDialog(
					"Diagnostics backend error",
					`${message}. The backend process could not be started.`
				);
			});
		} catch (error) {
			if (managingLock) {
				this.removeBackendLock();
			}
			const message = error instanceof Error ? error.message : String(error);
			this.updateBackendState({
				status: "error",
				message,
				updatedAt: new Date()
			});
			this.emit("backend-error", { message });
			this.showErrorDialog(
				"Failed to launch diagnostics backend",
				message
			);
		}
	}

	private async stopBackendProcess(): Promise<void> {
		if (!this.backendProcess) {
			return;
		}

		const processRef = this.backendProcess;
		this.backendProcess = null;

		processRef.removeAllListeners("exit");
		processRef.removeAllListeners("error");

		if (!processRef.killed) {
			processRef.kill();
		}

		if (!app.isPackaged) {
			this.removeBackendLock();
		}

		this.recordProcessEvent("exit", "Backend process stopped by application");
		this.updateBackendState({
			status: "stopped",
			message: "Backend stopped",
			updatedAt: new Date()
		});
	}

	private updateBackendState(next: Partial<BackendProcessState>): void {
		const merged: BackendProcessState = {
			...this.backendState,
			...next,
			updatedAt: next.updatedAt ?? new Date()
		};
		this.backendState = merged;
		this.emit("backend-state-changed", merged);
	}

	private recordProcessEvent(
		type: ProcessHealthEvent["type"],
		reason: string,
		exitCode: number | null = null
	): void {
		const event: ProcessHealthEvent = {
			id: randomUUID(),
			occurredAt: new Date(),
			type,
			exitCode,
			reason
		};

		this.processEvents = [...this.processEvents, event].slice(-MAX_PROCESS_EVENTS);
		this.emit("process-event", event);
	}

	private showErrorDialog(title: string, message: string): void {
		const browserWindow = this.options.getMainWindow?.() ?? undefined;
		const options = {
			type: "warning" as const,
			buttons: ["OK"],
			title,
			message,
			detail: app.isPackaged
				? undefined
				: "Check the terminal running Electron or the backend workspace for additional logs."
		};

		if (browserWindow) {
			void dialog.showMessageBox(browserWindow, options);
		} else {
			void dialog.showMessageBox(options);
		}
	}

	private async fetchSummaryFromBackend(): Promise<DiagnosticsSnapshotPayload | null> {
		try {
			const response = await this.performFetch("/internal/diagnostics/summary", {
				method: "GET"
			});

			if (response.status === 204) {
				return null;
			}

			if (!response.ok) {
				if (response.headers.get("content-type")?.includes("application/json")) {
					const payload = (await response.json()) as { errorCode?: string; message?: string };
					this.options.getLogger?.().warn?.(
						`Diagnostics summary request failed: ${payload.errorCode ?? response.status}`
					);
				} else {
					const text = await response.text();
					this.options.getLogger?.().warn?.(
						`Diagnostics summary request failed: ${response.status} ${text}`
					);
				}
				return null;
			}

			const payload = (await response.json()) as DiagnosticsSnapshotPayload;
			return payload;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.options.getLogger?.().warn?.(
				`Failed to fetch diagnostics summary: ${message}`
			);
			return null;
		}
	}

	private async refreshSnapshotFromBackend(): Promise<DiagnosticsRefreshResult> {
		try {
			const response = await this.performFetch("/internal/diagnostics/refresh", {
				method: "POST"
			});

			if (response.ok) {
				const payload = (await response.json()) as DiagnosticsSnapshotPayload;
				return { success: true, snapshot: payload };
			}

			let error: DiagnosticsErrorPayload;
			if (response.headers.get("content-type")?.includes("application/json")) {
				const payload = (await response.json()) as DiagnosticsErrorPayload;
				error = {
					errorCode: payload.errorCode,
					message: payload.message,
					retryAfterSeconds: payload.retryAfterSeconds
				};
			} else {
				const text = await response.text();
				error = {
					errorCode: `HTTP_${response.status}`,
					message: text || "Diagnostics refresh request failed"
				};
			}

			return { success: false, error };
		} catch (caughtError) {
			const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
			return {
				success: false,
				error: {
					errorCode: "DIAGNOSTICS_REFRESH_FAILED",
					message
				}
			};
		}
	}

	private async performFetch(pathname: string, init: RequestInit): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
		timeout.unref?.();

		try {
			const requestUrl = new URL(pathname, this.diagnosticsApiOrigin);
			const headers = new Headers(init.headers ?? undefined);
			if (!headers.has("accept")) {
				headers.set("accept", "application/json");
			}
			if (init.body !== undefined && !headers.has("content-type")) {
				headers.set("content-type", "application/json");
			}

			return await fetch(requestUrl, {
				...init,
				signal: controller.signal,
				headers
			});
		} finally {
			clearTimeout(timeout);
		}
	}

	private buildExportFilename(source: Date): string {
		const iso = source.toISOString();
		return `diagnostics-snapshot-${iso.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "")}.jsonl`;
	}

	private createFallbackExport(): DiagnosticsExportPayload | null {
		if (!this.latestSnapshot) {
			return null;
		}

		const generatedAtRaw = this.latestSnapshot.generatedAt ?? new Date().toISOString();
		const generatedAt = new Date(generatedAtRaw);
		const timestamp = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
		const filename = this.buildExportFilename(timestamp);
		const body = `${JSON.stringify(this.latestSnapshot)}\n`;

		return {
			filename,
			contentType: "application/x-ndjson",
			body
		};
	}

	private extractFilename(response: Response): string | null {
		const disposition = response.headers.get("content-disposition");
		if (!disposition) {
			return null;
		}

		const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i);
		if (!match) {
			return null;
		}

		try {
			return decodeURIComponent(match[1]);
		} catch (error) {
			this.options.getLogger?.().warn?.("Failed to decode diagnostics export filename", error);
			return match[1];
		}
	}

	private async ensureFallbackExport(): Promise<DiagnosticsExportPayload | null> {
		if (!this.latestSnapshot) {
			await this.fetchLatestSnapshot().catch(() => null);
		}
		return this.createFallbackExport();
	}

	private updateStorageHealth(
		next: StorageHealthAlertPayload | null,
		options: { force?: boolean } = {}
	): void {
		const changed = options.force ? true : !storageHealthEquals(this.latestStorageHealth, next);
		this.latestStorageHealth = next ? { ...next } : null;
		if (changed) {
			this.emit("preferences-storage-health", this.latestStorageHealth);
		}
	}

	private queuePreferenceSync(request: PreferenceSyncRequest): void {
		if (this.isShuttingDown) {
			return;
		}
		this.preferenceSyncTask = this.preferenceSyncTask
			.then(() => this.performPreferenceSync(request))
			.catch((error) => {
				this.options.getLogger?.().warn?.("Diagnostics preference sync failed", error);
			});
	}

	private async performPreferenceSync(request: PreferenceSyncRequest): Promise<void> {
		const logger = this.options.getLogger?.();
		const record = request.record;
		const payload: Record<string, unknown> = {
			highContrastEnabled: record.highContrastEnabled,
			reducedMotionEnabled: record.reducedMotionEnabled,
			remoteProvidersEnabled: record.remoteProvidersEnabled,
			consentSummary: record.consentSummary
		};

		if (request.consentEvent) {
			payload.consentEvent = request.consentEvent;
		}

		const maxAttempts = 4;
		let attempt = 0;
		let lastError: unknown = null;

		while (attempt < maxAttempts) {
			try {
				const response = await this.performFetch("/internal/diagnostics/preferences", {
					method: "PUT",
					body: JSON.stringify(payload)
				});

				if (response.ok) {
					return;
				}

				if (response.status === 503) {
					logger?.warn?.("Diagnostics preference sync deferred: backend storage unavailable");
					return;
				}

				const bodyText = await response.text().catch(() => "");
				lastError = new Error(
					`Unexpected diagnostics preference sync status ${response.status}${bodyText ? `: ${bodyText}` : ""}`
				);
			} catch (error) {
				lastError = error;
			}

			attempt += 1;
			if (attempt < maxAttempts) {
				await delay(Math.min(500 * 2 ** (attempt - 1), 3000));
			}
		}

		if (lastError) {
			logger?.warn?.(
				`Failed to sync diagnostics preferences with backend after ${maxAttempts} attempts (${request.reason})`,
				lastError
			);
		} else {
			logger?.warn?.(
				`Failed to sync diagnostics preferences with backend after ${maxAttempts} attempts (${request.reason})`
			);
		}
	}
}

