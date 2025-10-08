import { describe, it, expect } from "vitest";
import type { DiagnosticsPreferenceRecordPayload } from "@metaverse-systems/llm-tutor-shared";

interface PreferencesVaultContract {
	bootstrap(): Promise<void>;
	getCurrentRecord(): DiagnosticsPreferenceRecordPayload;
	on(
		event: "updated" | "storage-health",
		listener: (payload: DiagnosticsPreferenceRecordPayload) => void
	): () => void;
	updatePreferences(
		payload: {
			highContrastEnabled: boolean;
			reducedMotionEnabled: boolean;
			remoteProvidersEnabled: boolean;
			consentSummary: string;
			expectedLastUpdatedAt?: string;
			updatedBy: "renderer" | "backend" | "main";
		}
	): Promise<DiagnosticsPreferenceRecordPayload>;
}

interface FakeStoreOptions {
	failWrites?: boolean;
	writeDelayMs?: number;
}

class FakePreferenceStore {
	private value: DiagnosticsPreferenceRecordPayload | undefined;
	readonly writes: DiagnosticsPreferenceRecordPayload[] = [];
	private failWrites: boolean;
	private writeDelayMs: number;

	constructor(options: FakeStoreOptions = {}) {
		this.failWrites = options.failWrites ?? false;
		this.writeDelayMs = options.writeDelayMs ?? 0;
	}

	setSeed(payload: DiagnosticsPreferenceRecordPayload) {
		this.value = payload;
	}

	get(): DiagnosticsPreferenceRecordPayload | undefined {
		return this.value;
	}

	async set(payload: DiagnosticsPreferenceRecordPayload): Promise<void> {
		if (this.failWrites) {
			throw new Error("disk-full");
		}
		if (this.writeDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
		}
		this.writes.push(payload);
		this.value = payload;
	}

	switchToFailure() {
		this.failWrites = true;
	}
}


type PreferencesVaultCtor = new (options: { store: FakePreferenceStore }) => PreferencesVaultContract;

describe("PreferencesVault", () => {
	it("bootstraps with defaults when the store is empty", async () => {
		const { PreferencesVault } = await import("../../src/main/diagnostics/preferences/preferencesVault");
		const VaultCtor = PreferencesVault as unknown as PreferencesVaultCtor;
		const store = new FakePreferenceStore();

		const vault = new VaultCtor({ store });
		expect(typeof vault.bootstrap).toBe("function");

		await vault.bootstrap();
		const record = vault.getCurrentRecord();

		expect(record.highContrastEnabled).toBe(false);
		expect(record.reducedMotionEnabled).toBe(false);
		expect(record.remoteProvidersEnabled).toBe(false);
		expect(record.consentSummary).toBeDefined();
		expect(typeof record.lastUpdatedAt).toBe("string");
		expect(record.updatedBy).toBe("main");
	});

	it("queues writes so updates apply in order", async () => {
		const { PreferencesVault } = await import("../../src/main/diagnostics/preferences/preferencesVault");
		const VaultCtor = PreferencesVault as unknown as PreferencesVaultCtor;
		const store = new FakePreferenceStore({ writeDelayMs: 10 });
		const vault = new VaultCtor({ store });

		await vault.bootstrap();

		const updateA = vault.updatePreferences({
			highContrastEnabled: true,
			reducedMotionEnabled: false,
			remoteProvidersEnabled: false,
			consentSummary: "Toggle high contrast",
			updatedBy: "renderer",
			expectedLastUpdatedAt: vault.getCurrentRecord().lastUpdatedAt
		});

		const updateB = vault.updatePreferences({
			highContrastEnabled: false,
			reducedMotionEnabled: true,
			remoteProvidersEnabled: false,
			consentSummary: "Toggle reduced motion",
			updatedBy: "renderer",
			expectedLastUpdatedAt: vault.getCurrentRecord().lastUpdatedAt
		});

		const [first, second] = await Promise.all([updateA, updateB]);

		expect(store.writes).toHaveLength(2);
		expect(store.writes[0].highContrastEnabled).toBe(true);
		expect(store.writes[1].reducedMotionEnabled).toBe(true);
		expect(new Date(second.lastUpdatedAt).getTime()).toBeGreaterThan(new Date(first.lastUpdatedAt).getTime());
	});

	it("emits storage health alerts when persistence fails", async () => {
		const { PreferencesVault } = await import("../../src/main/diagnostics/preferences/preferencesVault");
		const VaultCtor = PreferencesVault as unknown as PreferencesVaultCtor;
		const store = new FakePreferenceStore();
		const vault = new VaultCtor({ store });

		await vault.bootstrap();

		const listeners: DiagnosticsPreferenceRecordPayload[] = [];
		const dispose = vault.on("storage-health", (record) => {
			listeners.push(record);
		});

		store.switchToFailure();

		const result = await vault.updatePreferences({
			highContrastEnabled: true,
			reducedMotionEnabled: true,
			remoteProvidersEnabled: false,
			consentSummary: "Disk failure attempt",
			updatedBy: "renderer",
			expectedLastUpdatedAt: vault.getCurrentRecord().lastUpdatedAt
		});

		expect(result.storageHealth?.status).toBe("unavailable");
		expect(result.storageHealth?.reason).toBe("disk-full");
		expect(listeners).toHaveLength(1);
		expect(listeners[0].storageHealth?.status).toBe("unavailable");

		dispose();
	});
});
