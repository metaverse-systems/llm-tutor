import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import {
	DiagnosticsSnapshot,
	DiagnosticsSnapshotPayload,
	parseDiagnosticsSnapshot,
	serializeDiagnosticsSnapshot
} from "@metaverse-systems/llm-tutor-shared";
import {
	BackendHealthState,
	DiagnosticsSnapshotRepository,
	DiagnosticsSnapshotService,
	DiagnosticsSnapshotServiceOptions,
	MutableDiagnosticsStorageMetricsCollector,
	createMutableDiagnosticsStorageMetricsCollector
} from "../../services/diagnostics";
import {
	registerDiagnosticsRoutes,
	type BackendLifecycleState,
	type DiagnosticsRoutesOptions,
	type DiagnosticsSnapshotStore,
	type RefreshRateLimiter
} from "./routes";

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

	async listSnapshots(): Promise<DiagnosticsSnapshot[]> {
		return [...this.snapshots].sort(
			(a, b) => a.generatedAt.getTime() - b.generatedAt.getTime()
		);
	}

	async getLatest(): Promise<DiagnosticsSnapshot | null> {
		const ordered = await this.listSnapshots();
		return ordered.at(-1) ?? null;
	}

	async save(snapshot: DiagnosticsSnapshot): Promise<void> {
		const filtered = this.snapshots.filter((existing) => existing.id !== snapshot.id);
		filtered.push(snapshot);
		this.snapshots = filtered.sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime());
	}

	async clear(): Promise<void> {
		this.snapshots = [];
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
	private preference: DiagnosticsSnapshot["activePreferences"];

	constructor(seed: DiagnosticsSnapshot["activePreferences"]) {
		this.preference = seed;
	}

	get(): DiagnosticsSnapshot["activePreferences"] {
		return { ...this.preference, updatedAt: new Date(this.preference.updatedAt) };
	}

	set(preference: DiagnosticsSnapshot["activePreferences"]): void {
		this.preference = preference;
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

interface DiagnosticsTestHarnessOptions {
	initialSnapshot?: DiagnosticsSnapshotPayload | null;
}

interface DiagnosticsTestHarness {
	app: FastifyInstance;
	seedSnapshot(seed: DiagnosticsSnapshotPayload): Promise<void>;
	clearSnapshots(): Promise<void>;
	setBackendState(state: BackendLifecycleState, message?: string): Promise<void>;
	setRefreshCooldown(seconds: number): void;
	advanceTime(milliseconds: number): void;
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
		accessibilityPreferenceLoader:
			overrides.accessibilityPreferenceLoader ?? (async () => preferences.get()),
		llmProbe: overrides.llmProbe ?? (async () => ({ status: "disabled" })),
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
	clock: VirtualClock
): Promise<FastifyInstance> {
	const app = Fastify({ logger: false });

	const routes: DiagnosticsRoutesOptions = {
		store,
		snapshotService,
		refreshLimiter,
		getBackendLifecycleState: () => backendLifecycle.getLifecycle(),
		now: () => clock.now(),
		retentionWindowDays: 30
	};

	await registerDiagnosticsRoutes(app, routes);
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
	const preferenceManager = new PreferenceManager({
		highContrast: false,
		reduceMotion: false,
		updatedAt: clock.now()
	});
	const refreshLimiter = new SimpleRefreshRateLimiter();

	const snapshotService = createSnapshotService(
		store,
		metricsCollector,
		clock,
		preferenceManager,
		backendLifecycle
	);

	const app = await buildFastifyApp(store, snapshotService, refreshLimiter, backendLifecycle, clock);

	async function seedSnapshot(seed: DiagnosticsSnapshotPayload): Promise<void> {
		const snapshot = parseDiagnosticsSnapshot(seed);
		await store.save(snapshot);
		preferenceManager.set(snapshot.activePreferences);
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
		setBackendState: async (state: BackendLifecycleState, message?: string) => {
			backendLifecycle.set(state, message);
		},
		setRefreshCooldown: (seconds: number) => {
			refreshLimiter.setCooldown(seconds);
		},
		advanceTime: (milliseconds: number) => {
			clock.advance(milliseconds);
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
	const preferenceManager = new PreferenceManager({
		highContrast: false,
		reduceMotion: false,
		updatedAt: clock.now()
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

	return buildFastifyApp(store, snapshotService, refreshLimiter, backendLifecycle, clock);
}

export {
	serializeDiagnosticsSnapshot
};
