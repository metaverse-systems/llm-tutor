import {
	createDiagnosticsPreferenceRecord,
	createStorageFailureAlert,
	parseDiagnosticsPreferenceRecord,
	serializeDiagnosticsPreferenceRecord,
	updateDiagnosticsPreferenceRecord,
	withStorageHealth,
	type DiagnosticsPreferenceRecord,
	type DiagnosticsPreferenceRecordPayload,
	type DiagnosticsPreferenceUpdate,
	type StorageHealthAlert,
	type StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";
import type ElectronStore from "electron-store";
import type { Options as ElectronStoreOptions } from "electron-store";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";

type PreferencesVaultEvent = "updated" | "storage-health";

let cachedElectronStoreCtor: ElectronStoreConstructor | null = null;
let pendingElectronStoreCtor: Promise<ElectronStoreConstructor> | null = null;

async function resolveElectronStore(): Promise<ElectronStoreConstructor> {
	if (cachedElectronStoreCtor) {
		return cachedElectronStoreCtor;
	}

	if (!pendingElectronStoreCtor) {
		pendingElectronStoreCtor = import("electron-store").then((module: unknown) => {
			const candidate =
				typeof module === "function"
					? module
					: typeof (module as { default?: unknown }).default === "function"
						? (module as { default: unknown }).default
						: undefined;

			if (typeof candidate !== "function") {
				throw new Error("electron-store module is unavailable");
			}

			const ctor = candidate as ElectronStoreConstructor;
			cachedElectronStoreCtor = ctor;
			return ctor;
		});
	}

	return pendingElectronStoreCtor;
}

interface PreferencesVaultEvents {
	updated: (payload: DiagnosticsPreferenceRecordPayload) => void;
	"storage-health": (payload: DiagnosticsPreferenceRecordPayload) => void;
}

interface PreferenceStorePayload {
	record?: DiagnosticsPreferenceRecordPayload;
}

interface PreferencesVaultStore {
	get():
		| DiagnosticsPreferenceRecordPayload
		| undefined
		| Promise<DiagnosticsPreferenceRecordPayload | undefined>;
	set(value: DiagnosticsPreferenceRecordPayload): void | Promise<void>;
}

type ElectronStoreConstructor = new (
	options?: ElectronStoreOptions<PreferenceStorePayload>
) => ElectronStore<PreferenceStorePayload>;

export interface PreferencesVaultUpdate extends Omit<DiagnosticsPreferenceUpdate, "updatedBy"> {
	updatedBy: DiagnosticsPreferenceUpdate["updatedBy"];
}

export interface PreferencesVaultOptions {
	store?: PreferencesVaultStore;
	logger?: Pick<Console, "warn" | "error">;
	now?: () => Date;
}

class TypedEventEmitter extends EventEmitter {
	on<U extends PreferencesVaultEvent>(event: U, listener: PreferencesVaultEvents[U]): this {
		return super.on(event, listener);
	}

	off<U extends PreferencesVaultEvent>(event: U, listener: PreferencesVaultEvents[U]): this {
		return super.off(event, listener);
	}

	emit<U extends PreferencesVaultEvent>(event: U, payload: Parameters<PreferencesVaultEvents[U]>[0]): boolean {
		return super.emit(event, payload);
	}
}

class ElectronPreferenceStore implements PreferencesVaultStore {
	private store: ElectronStore<PreferenceStorePayload> | null = null;
	private storePromise: Promise<ElectronStore<PreferenceStorePayload>> | null = null;

	private async ensureStore(): Promise<ElectronStore<PreferenceStorePayload>> {
		if (this.store) {
			return this.store;
		}

		if (this.storePromise === null) {
			this.storePromise = resolveElectronStore().then((StoreCtor: ElectronStoreConstructor) => {
				const instance = new StoreCtor({
					name: "diagnostics-preferences"
				});
				this.store = instance;
				return instance;
			});
		}

		return this.storePromise;
	}

	async get(): Promise<DiagnosticsPreferenceRecordPayload | undefined> {
		const store = await this.ensureStore();
		const accessor = store as unknown as {
			get(key: string): DiagnosticsPreferenceRecordPayload | undefined;
		};
		return accessor.get("record");
	}

	async set(value: DiagnosticsPreferenceRecordPayload): Promise<void> {
		const store = await this.ensureStore();
		const accessor = store as unknown as {
			set(key: string, input: DiagnosticsPreferenceRecordPayload): void;
		};
		accessor.set("record", value);
	}
}

function formatUnknownError(error: unknown, fallback: string): string {
	if (typeof error === "string") {
		return error.trim() || fallback;
	}

	if (error instanceof Error) {
		return error.message || fallback;
	}

	if (error === null || error === undefined) {
		return fallback;
	}

	if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
		return `${error}`;
	}

	return inspect(error, { depth: 1 }) ?? fallback;
}

export class PreferencesVault {
	private readonly store: PreferencesVaultStore;
	private readonly emitter = new TypedEventEmitter();
	private readonly logger?: Pick<Console, "warn" | "error">;
	private readonly now: () => Date;
	private current: DiagnosticsPreferenceRecord | null = null;
	private writeQueue: Promise<void> = Promise.resolve();
	private pendingUpdates = 0;
	private queueExpectedBaseline: number | null = null;

	constructor(options: PreferencesVaultOptions = {}) {
		this.store = options.store ?? new ElectronPreferenceStore();
		this.logger = options.logger;
		this.now = options.now ?? (() => new Date());
	}

	async bootstrap(): Promise<void> {
		if (this.current) {
			return;
		}

		const payload = await Promise.resolve(this.store.get());
		if (payload) {
			const record = parseDiagnosticsPreferenceRecord(payload);
			this.current = record;
			this.emitUpdated(record);
			if (record.storageHealth) {
				this.emitStorageHealth(record);
			}
			return;
		}

		const seed = createDiagnosticsPreferenceRecord({
			lastUpdatedAt: this.now(),
			updatedBy: "main"
		});
		this.current = seed;
		this.emitUpdated(seed);
	}

	getCurrentRecord(): DiagnosticsPreferenceRecordPayload {
		const record = this.ensureCurrent();
		return serializeDiagnosticsPreferenceRecord(record);
	}

	getStorageHealth(): StorageHealthAlertPayload | null {
		const record = this.ensureCurrent();
		if (!record.storageHealth) {
			return null;
		}
		return serializeDiagnosticsPreferenceRecord(record).storageHealth ?? null;
	}

	on<U extends PreferencesVaultEvent>(event: U, listener: PreferencesVaultEvents[U]): () => void {
		this.emitter.on(event, listener);
		return () => this.emitter.off(event, listener);
	}

	async updatePreferences(update: PreferencesVaultUpdate): Promise<DiagnosticsPreferenceRecordPayload> {
		await this.bootstrap();

		if (this.pendingUpdates === 0) {
			const baseline = this.ensureCurrent();
			this.queueExpectedBaseline = baseline.lastUpdatedAt.getTime();
		}

		this.pendingUpdates += 1;

		const run = this.writeQueue.then(() => this.performUpdate(update));
		this.writeQueue = run
			.then(
				() => undefined,
				() => undefined
			)
			.finally(() => {
				this.pendingUpdates = Math.max(0, this.pendingUpdates - 1);
				if (this.pendingUpdates === 0) {
					const latest = this.ensureCurrent();
					this.queueExpectedBaseline = latest.lastUpdatedAt.getTime();
				}
			});

		return run;
	}

	private async performUpdate(update: PreferencesVaultUpdate): Promise<DiagnosticsPreferenceRecordPayload> {
		const current = this.ensureCurrent();

		if (update.expectedLastUpdatedAt) {
			const expectedTime = new Date(update.expectedLastUpdatedAt).getTime();
			const currentTime = current.lastUpdatedAt.getTime();
			const baselineTime = this.queueExpectedBaseline ?? currentTime;
			if (
				!Number.isFinite(expectedTime) ||
				(expectedTime !== currentTime && expectedTime !== baselineTime)
			) {
				throw new PreferencesVaultConcurrencyError();
			}
		}

		let next = updateDiagnosticsPreferenceRecord(current, {
			...update,
			updatedBy: update.updatedBy
		});

		next = {
			...next,
			lastUpdatedAt: this.now(),
			storageHealth: null
		};

		try {
			await this.persist(next);
			const persisted = parseDiagnosticsPreferenceRecord(serializeDiagnosticsPreferenceRecord(next));
			this.current = persisted;
			this.emitUpdated(persisted);
			if (current.storageHealth) {
				this.emitStorageHealth(persisted);
			}
			return serializeDiagnosticsPreferenceRecord(persisted);
		} catch (error) {
			const recovery = this.handlePersistenceFailure(next, error);
			return serializeDiagnosticsPreferenceRecord(recovery);
		}
	}

	private async persist(record: DiagnosticsPreferenceRecord): Promise<void> {
		const payload = serializeDiagnosticsPreferenceRecord(record);
		await Promise.resolve(this.store.set(payload));
	}

	private handlePersistenceFailure(
		record: DiagnosticsPreferenceRecord,
		error: unknown
	): DiagnosticsPreferenceRecord {
		const reason = inferStorageFailureReason(error);
		const message = formatUnknownError(error, "Unknown error");
		const alert = createStorageFailureAlert(
			reason,
			`Failed to persist diagnostics preferences: ${message}`
		);
		const withAlert = withStorageHealth(record, alert);
		this.current = withAlert;
		this.logger?.warn?.(`[diagnostics] Preference vault persistence failed: ${message}`);
		this.emitUpdated(withAlert);
		this.emitStorageHealth(withAlert);
		return withAlert;
	}

	private emitUpdated(record: DiagnosticsPreferenceRecord): void {
		const payload = serializeDiagnosticsPreferenceRecord(record);
		this.emitter.emit("updated", payload);
	}

	private emitStorageHealth(record: DiagnosticsPreferenceRecord): void {
		const payload = serializeDiagnosticsPreferenceRecord(record);
		this.emitter.emit("storage-health", payload);
	}

	private ensureCurrent(): DiagnosticsPreferenceRecord {
		if (!this.current) {
			throw new Error("PreferencesVault has not been bootstrapped");
		}
		return this.current;
	}
}

export class PreferencesVaultConcurrencyError extends Error {
	readonly code = "DIAGNOSTICS_PREFERENCES_STALE" as const;

	constructor(message = "Diagnostics preferences have been modified since the last read.") {
		super(message);
		this.name = "PreferencesVaultConcurrencyError";
	}
}

function inferStorageFailureReason(error: unknown): StorageHealthAlert["reason"] {
	const message = formatUnknownError(error, "").toLowerCase();
	if (message.includes("permission") || message.includes("eacces")) {
		return "permission-denied";
	}
	if (message.includes("disk") || message.includes("space") || message.includes("enospc")) {
		return "disk-full";
	}
	if (message.includes("corrupt") || message.includes("corruption")) {
		return "corrupted";
	}
	return "unknown";
}
