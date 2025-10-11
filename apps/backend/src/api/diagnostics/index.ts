import {
	createDiagnosticsPreferenceRecord,
	parseDiagnosticsPreferenceRecord,
	parseDiagnosticsSnapshot,
	serializeDiagnosticsPreferenceRecord,
	serializeDiagnosticsSnapshot
} from "@metaverse-systems/llm-tutor-shared";
import type {
	DiagnosticsPreferenceRecord,
	DiagnosticsPreferenceRecordPayload,
	DiagnosticsSnapshot,
	DiagnosticsSnapshotPayload
} from "@metaverse-systems/llm-tutor-shared";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import {
	registerDiagnosticsRoutes,
	type BackendLifecycleState,
	type DiagnosticsRoutesOptions,
	type DiagnosticsSnapshotStore,
	type RefreshRateLimiter
} from "./routes.js";
import { createDiagnosticsLogger } from "../../infra/logging/diagnostics-logger.js";
import {
	createInMemoryDiagnosticsPreferenceAdapter,
	type DiagnosticsPreferenceAdapter
} from "../../infra/preferences/index.js";
import {
	createMutableDiagnosticsStorageMetricsCollector,
	type BackendHealthState,
	type DiagnosticsSnapshotServiceOptions,
	type MutableDiagnosticsStorageMetricsCollector,
	DiagnosticsSnapshotService
} from "../../services/diagnostics/index.js";
import { registerProfileRoutes } from "../llm/profile.routes.js";

const DEFAULT_STORAGE_DIR = "/tmp/llm-tutor/diagnostics";

class VirtualClock {
	private reference: number;
	private offsetMs = 0;

	constructor(seed: Date = new Date()) {
		this.reference = seed.getTime();
	}

	now(): Date {
		return new Date(this.reference + this.offsetMs);
	}

	advance(milliseconds: number): void {
		this.offsetMs += milliseconds;
	}
}

class InMemoryDiagnosticsSnapshotStore implements DiagnosticsSnapshotStore {
	private snapshots: DiagnosticsSnapshot[] = [];

	listSnapshots(): Promise<DiagnosticsSnapshot[]> {
		return Promise.resolve(
			[...this.snapshots].sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime())
		);
	}

	async getLatest(): Promise<DiagnosticsSnapshot | null> {
		const ordered = await this.listSnapshots();
		return ordered.at(-1) ?? null;
	}

	save(snapshot: DiagnosticsSnapshot): Promise<void> {
		const filtered = this.snapshots.filter((existing) => existing.id !== snapshot.id);
		filtered.push(snapshot);
		this.snapshots = filtered.sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime());
		return Promise.resolve();
	}

	clear(): Promise<void> {
		this.snapshots = [];
		return Promise.resolve();
	}

	async countSnapshotsSince(date: Date): Promise<number> {
		return (await this.listSnapshots()).filter(
			(snapshot) => snapshot.generatedAt.getTime() >= date.getTime()
		).length;
	}

	setSnapshots(snapshots: DiagnosticsSnapshot[]): void {
		this.snapshots = [...snapshots].sort(
			(a, b) => a.generatedAt.getTime() - b.generatedAt.getTime()
		);
	}
}

class PreferenceManager {
	private preference: DiagnosticsPreferenceRecord;

	constructor(seed: DiagnosticsPreferenceRecord) {
		this.preference = parseDiagnosticsPreferenceRecord(serializeDiagnosticsPreferenceRecord(seed));
	}

	get(): DiagnosticsPreferenceRecord {
		return parseDiagnosticsPreferenceRecord(serializeDiagnosticsPreferenceRecord(this.preference));
	}

	set(preference: DiagnosticsPreferenceRecord): void {
		this.preference = parseDiagnosticsPreferenceRecord(serializeDiagnosticsPreferenceRecord(preference));
	}
}

class BackendLifecycleController {
	private lifecycle: BackendLifecycleState = "ready";
	private message?: string;

	set(state: BackendLifecycleState, message?: string): void {
		this.lifecycle = state;
		this.message = message;
	}

	getLifecycle(): BackendLifecycleState {
		return this.lifecycle;
	}

	asHealthState(): BackendHealthState {
		if (this.lifecycle === "error") {
			return { status: "error", message: this.message };
		}

		if (this.lifecycle === "ready") {
			return { status: "running", message: this.message };
		}

		return { status: "running", message: this.message ?? "Backend warming up" };
	}
}

class SimpleRefreshRateLimiter implements RefreshRateLimiter {
	private cooldownSeconds = 0;
	private lastRefreshAt: Date | null = null;

	setCooldown(seconds: number): void {
		this.cooldownSeconds = Math.max(0, seconds);
	}

	reset(): void {
		this.lastRefreshAt = null;
	}

	getRetryAfterSeconds(now: Date): number {
		if (!this.lastRefreshAt || this.cooldownSeconds === 0) {
			return 0;
		}

		const target = this.lastRefreshAt.getTime() + this.cooldownSeconds * 1000;
		const remaining = target - now.getTime();
		if (remaining <= 0) {
			return 0;
		}

		return Math.ceil(remaining / 1000);
	}

	recordSuccessfulRefresh(now: Date): void {
		this.lastRefreshAt = now;
	}
}

interface LegacyDiagnosticsPreferenceSeed {
	highContrast: boolean;
	reduceMotion: boolean;
	updatedAt: string;
}

type LegacyDiagnosticsSnapshotSeed = Omit<DiagnosticsSnapshotPayload, "activePreferences"> & {
	activePreferences: LegacyDiagnosticsPreferenceSeed;
};

type DiagnosticsSnapshotSeedInput = DiagnosticsSnapshotPayload | LegacyDiagnosticsSnapshotSeed;

function isLegacySnapshotSeed(
	seed: DiagnosticsSnapshotSeedInput
): seed is LegacyDiagnosticsSnapshotSeed {
	const prefs = (seed as LegacyDiagnosticsSnapshotSeed).activePreferences;
	return (
		prefs !== undefined &&
		"highContrast" in prefs &&
		!Object.prototype.hasOwnProperty.call(prefs, "highContrastEnabled")
	);
}

function normalizeSnapshotSeed(seed: DiagnosticsSnapshotSeedInput): DiagnosticsSnapshotPayload {
	if (!isLegacySnapshotSeed(seed)) {
		return seed;
	}

	const preference = createDiagnosticsPreferenceRecord({
		highContrastEnabled: seed.activePreferences.highContrast,
		reducedMotionEnabled: seed.activePreferences.reduceMotion,
		remoteProvidersEnabled: false,
		lastUpdatedAt: new Date(seed.activePreferences.updatedAt),
		updatedBy: "main",
		consentSummary:
			seed.activePreferences.highContrast || seed.activePreferences.reduceMotion
				? "Accessibility preferences updated"
				: "Remote providers are disabled"
	});

	return {
		...seed,
		activePreferences: serializeDiagnosticsPreferenceRecord(preference)
	};
}

interface DiagnosticsTestHarnessOptions {
	initialSnapshot?: DiagnosticsSnapshotSeedInput | null;
}

interface DiagnosticsTestHarness {
	app: FastifyInstance;
	seedSnapshot(seed: DiagnosticsSnapshotSeedInput): Promise<void>;
	clearSnapshots(): Promise<void>;
	setBackendState(state: BackendLifecycleState, message?: string): Promise<void>;
	setRefreshCooldown(seconds: number): void;
	advanceTime(milliseconds: number): void;
	loadPreferenceState(): Promise<DiagnosticsPreferenceRecordPayload>;
	seedPreferenceState(payload: DiagnosticsPreferenceRecordPayload): Promise<void>;
	simulatePreferenceVaultUnavailable(): Promise<void>;
	restorePreferenceVault(): Promise<void>;
	close(): Promise<void>;
}

function createSnapshotService(
	store: DiagnosticsSnapshotStore,
	metricsCollector: MutableDiagnosticsStorageMetricsCollector,
	clock: VirtualClock,
	preferences: PreferenceManager,
	backendLifecycle: BackendLifecycleController,
	overrides: Partial<DiagnosticsSnapshotServiceOptions> = {}
): DiagnosticsSnapshotService {
	const options: DiagnosticsSnapshotServiceOptions = {
		storageDir: overrides.storageDir ?? DEFAULT_STORAGE_DIR,
		rendererUrlProvider: overrides.rendererUrlProvider ?? (() => "http://localhost:5173"),
		backendStateProvider: overrides.backendStateProvider ?? (() => backendLifecycle.asHealthState()),
		preferenceRecordLoader:
			overrides.preferenceRecordLoader ?? (() => Promise.resolve(preferences.get())),
		llmProbe: overrides.llmProbe ?? (() => Promise.resolve({ status: "disabled" })),
		retentionWindowDays: overrides.retentionWindowDays ?? 30,
		now: overrides.now ?? (() => clock.now())
	};

	return new DiagnosticsSnapshotService(store, metricsCollector, options);
}

async function buildFastifyApp(
	store: DiagnosticsSnapshotStore,
	snapshotService: DiagnosticsSnapshotService,
	refreshLimiter: SimpleRefreshRateLimiter,
	backendLifecycle: BackendLifecycleController,
	clock: VirtualClock,
	preferenceAdapter: DiagnosticsPreferenceAdapter,
	preferences: PreferenceManager
): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	const routes: DiagnosticsRoutesOptions = {
		store,
		snapshotService,
		refreshLimiter,
		getBackendLifecycleState: () => backendLifecycle.getLifecycle(),
		now: () => clock.now(),
		retentionWindowDays: 30,
		preferences: {
			adapter: preferenceAdapter,
			onRecordUpdated: (payload: DiagnosticsPreferenceRecordPayload) => {
				const record = parseDiagnosticsPreferenceRecord(payload);
				preferences.set(record);
			}
		}
	};

	await registerDiagnosticsRoutes(app, routes);
	
	// Create diagnostics logger for LLM operations using a unique temporary directory
	const diagnosticsDir = `/tmp/llm-tutor-test-diagnostics-${randomUUID()}`;
	const diagnosticsLogger = createDiagnosticsLogger({
		logDirectory: diagnosticsDir
	});
	
	// Set environment variable for export to find events
	process.env.LLM_TUTOR_DIAGNOSTICS_DIR = diagnosticsDir;
	
	await app.register(registerProfileRoutes, { 
		prefix: "/api/llm/profiles",
		diagnosticsLogger 
	});
	await app.ready();
	return app;
}

export async function createDiagnosticsTestHarness(
	options: DiagnosticsTestHarnessOptions = {}
): Promise<DiagnosticsTestHarness> {
	const clock = new VirtualClock();
	const store = new InMemoryDiagnosticsSnapshotStore();
	const metricsCollector = createMutableDiagnosticsStorageMetricsCollector();
	const backendLifecycle = new BackendLifecycleController();
	const preferenceManager = new PreferenceManager(
		createDiagnosticsPreferenceRecord({
			lastUpdatedAt: clock.now(),
			updatedBy: "main"
		})
	);
	const preferenceAdapter = createInMemoryDiagnosticsPreferenceAdapter({
		initialRecord: preferenceManager.get(),
		now: () => clock.now()
	});
	const refreshLimiter = new SimpleRefreshRateLimiter();

	const snapshotService = createSnapshotService(
		store,
		metricsCollector,
		clock,
		preferenceManager,
		backendLifecycle
	);

	const app = await buildFastifyApp(
		store,
		snapshotService,
		refreshLimiter,
		backendLifecycle,
		clock,
		preferenceAdapter,
		preferenceManager
	);

	async function seedSnapshot(seed: DiagnosticsSnapshotSeedInput): Promise<void> {
		const normalized = normalizeSnapshotSeed(seed);
		const snapshot = parseDiagnosticsSnapshot(normalized);
		await store.save(snapshot);
		preferenceManager.set(snapshot.activePreferences);
		await preferenceAdapter.seed?.(serializeDiagnosticsPreferenceRecord(snapshot.activePreferences));
		metricsCollector.setDiskUsageBytes(seed.diskUsageBytes);
		metricsCollector.setWarnings(seed.warnings ?? []);
	}

	if (options.initialSnapshot) {
		await seedSnapshot(options.initialSnapshot);
	}

	return {
		app,
		seedSnapshot,
		clearSnapshots: async () => {
			await store.clear();
			metricsCollector.setDiskUsageBytes(0);
			metricsCollector.setWarnings([]);
			refreshLimiter.reset();
		},
		setBackendState: (state: BackendLifecycleState, message?: string): Promise<void> => {
			backendLifecycle.set(state, message);
			return Promise.resolve();
		},
		setRefreshCooldown: (seconds: number) => {
			refreshLimiter.setCooldown(seconds);
		},
		advanceTime: (milliseconds: number) => {
			clock.advance(milliseconds);
		},
		loadPreferenceState: async () => preferenceAdapter.load(),
		seedPreferenceState: async (payload) => {
			await preferenceAdapter.seed?.(payload);
			const record = parseDiagnosticsPreferenceRecord(payload);
			preferenceManager.set(record);
		},
		simulatePreferenceVaultUnavailable: async () => {
			await preferenceAdapter.simulateUnavailable?.();
		},
		restorePreferenceVault: async () => {
			await preferenceAdapter.restoreAvailability?.();
		},
		close: async () => {
			await app.close();
		}
	};
}

export interface DiagnosticsAppOptions {
	snapshotServiceOverrides?: Partial<DiagnosticsSnapshotServiceOptions>;
}

export async function createDiagnosticsApp(
	options: DiagnosticsAppOptions = {}
): Promise<FastifyInstance> {
	const clock = new VirtualClock();
	const store = new InMemoryDiagnosticsSnapshotStore();
	const metricsCollector = createMutableDiagnosticsStorageMetricsCollector();
	const backendLifecycle = new BackendLifecycleController();
	const preferenceManager = new PreferenceManager(
		createDiagnosticsPreferenceRecord({
			lastUpdatedAt: clock.now(),
			updatedBy: "main"
		})
	);
	const preferenceAdapter = createInMemoryDiagnosticsPreferenceAdapter({
		initialRecord: preferenceManager.get(),
		now: () => clock.now()
	});
	const refreshLimiter = new SimpleRefreshRateLimiter();

	const snapshotService = createSnapshotService(
		store,
		metricsCollector,
		clock,
		preferenceManager,
		backendLifecycle,
		options.snapshotServiceOverrides
	);

	const app = await buildFastifyApp(
		store,
		snapshotService,
		refreshLimiter,
		backendLifecycle,
		clock,
		preferenceAdapter,
		preferenceManager
	);

	const bootstrapSnapshot = await snapshotService.generateSnapshot();
	await store.save(bootstrapSnapshot);

	return app;
}

export {
	serializeDiagnosticsSnapshot
};
