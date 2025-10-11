import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import type { ProfileVault } from "@metaverse-systems/llm-tutor-shared/llm";

import { EncryptionService, type SafeStorageAdapter } from "../../src/infra/encryption/index.js";
import { ProfileService } from "../../src/services/llm/profile.service.js";
import {
	ProfileVaultService,
	createInMemoryProfileVaultStore
} from "../../src/services/llm/profile-vault.js";

const PROFILE_COUNT = 100;
const LIST_P95_TARGET_MS = 100;
const CREATE_P95_TARGET_MS = 500;
const UPDATE_P95_TARGET_MS = 200;
const DELETE_P95_TARGET_MS = 200;

const ITERATIONS = 75;

describe("ProfileService performance", () => {
	it("meets CRUD latency targets with 100-profile vault", async () => {
		const listContext = createBenchmarkContext();
		const listDurations = await measureOperation(listContext, async (context) => {
			await context.service.listProfiles();
		});

		const listP95 = percentile(listDurations, 95);
		expect(listP95).toBeLessThan(LIST_P95_TARGET_MS);

		const createContext = createBenchmarkContext();
		const createDurations = await measureOperation(createContext, async (context, iteration) => {
			await context.service.createProfile({
				name: `Benchmark Profile ${iteration}`,
				providerType: "llama.cpp",
				endpointUrl: "http://localhost:8080",
				apiKey: `api-key-${iteration}`,
				modelId: null,
				consentTimestamp: null
			});
		});

		const createP95 = percentile(createDurations, 95);
		expect(createP95).toBeLessThan(CREATE_P95_TARGET_MS);

		const updateContext = createBenchmarkContext();
		const targetUpdateId = updateContext.baseline.profileIds[1];
		const updateDurations = await measureOperation(updateContext, async (context, iteration) => {
			await context.service.updateProfile({
				id: targetUpdateId,
				name: `Updated Profile ${iteration}`
			});
		});

		const updateP95 = percentile(updateDurations, 95);
		expect(updateP95).toBeLessThan(UPDATE_P95_TARGET_MS);

		const deleteContext = createBenchmarkContext();
		const targetDeleteId = deleteContext.baseline.profileIds[2];
		const deleteDurations = await measureOperation(deleteContext, async (context) => {
			await context.service.deleteProfile({ id: targetDeleteId });
		});

		const deleteP95 = percentile(deleteDurations, 95);
		expect(deleteP95).toBeLessThan(DELETE_P95_TARGET_MS);

		console.info("[perf] ProfileService CRUD p95 (ms)", {
			list: listP95.toFixed(3),
			create: createP95.toFixed(3),
			update: updateP95.toFixed(3),
			delete: deleteP95.toFixed(3)
		});
	});
});

interface BenchmarkContext {
	service: ProfileService;
	baseline: {
		vault: ProfileVault;
		profileIds: string[];
	};
	resetState(): void;
}

async function measureOperation(
	context: BenchmarkContext,
	op: (ctx: BenchmarkContext, iteration: number) => Promise<void>
): Promise<number[]> {
	const durations: number[] = [];
	for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
		context.resetState();
		const start = performance.now();
		await op(context, iteration);
		durations.push(performance.now() - start);
	}
	return durations;
}

function createBenchmarkContext(): BenchmarkContext {
	const baselineVault = createBaselineVault();
	const store = createInMemoryProfileVaultStore(baselineVault);
	const vaultService = new ProfileVaultService({ store });
	const encryptionService = new EncryptionService({ safeStorage: createSafeStorageAdapter() });
	const clock = createClock();
	const service = new ProfileService({
		vaultService,
		encryptionService,
		diagnosticsRecorder: null,
		now: clock.tick,
		uuid: () => randomUUID()
	});

	return {
		service,
		baseline: {
			vault: cloneVault(baselineVault),
			profileIds: baselineVault.profiles.map((profile) => profile.id)
		},
		resetState(): void {
			store.set(cloneVault(baselineVault));
			clock.reset();
		}
	};
}

function createBaselineVault(): ProfileVault {
	const baseTime = 1_725_000_000_000;
	const profiles = Array.from({ length: PROFILE_COUNT }, (_, index) => {
		const id = randomUUID();
		return {
			id,
			name: `Seed Profile ${index}`,
			providerType: "llama.cpp" as const,
			endpointUrl: `http://localhost:${8080 + (index % 5)}`,
			apiKey: Buffer.from(`seed-key-${index}`).toString("base64"),
			modelId: null,
			isActive: index === 0,
			consentTimestamp: null,
			createdAt: baseTime + index,
			modifiedAt: baseTime + index
		};
	});

	return {
		profiles,
		encryptionAvailable: true,
		version: "1.0.0"
	};
}

function createSafeStorageAdapter(): SafeStorageAdapter {
	return {
		isEncryptionAvailable(): boolean {
			return true;
		},
		encryptString(plaintext: string): Buffer {
			return Buffer.from(plaintext, "utf8");
		},
		decryptString(buffer: Buffer): string {
			return buffer.toString("utf8");
		}
	};
}

function createClock(): { tick: () => number; reset: () => void } {
	let current = 0;
	const base = 1_725_000_000_000;
	return {
		tick(): number {
			current += 1;
			return base + current;
		},
		reset(): void {
			current = 0;
		}
	};
}

function percentile(values: number[], percentileRank: number): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.ceil((percentileRank / 100) * sorted.length) - 1);
	return sorted[index];
}

function cloneVault<T>(value: T): T {
	if (typeof globalThis.structuredClone === "function") {
		return globalThis.structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}