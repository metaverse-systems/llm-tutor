import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { z } from "zod";
import type {
	DiagnosticsPreferenceRecordPayload,
	StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";
import {
	diagnosticsPreferenceRecordSchema,
	storageHealthAlertSchema
} from "@metaverse-systems/llm-tutor-shared";

interface DiagnosticsTestResponse {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
}

interface DiagnosticsPreferenceTestHarness {
	app: {
		inject(request: { method: "GET" | "PUT"; url: string; payload?: unknown }): Promise<DiagnosticsTestResponse>;
		close(): Promise<void>;
	};
	close(): Promise<void>;
	loadPreferenceState(): Promise<DiagnosticsPreferenceRecordPayload>;
	seedPreferenceState(payload: DiagnosticsPreferenceRecordPayload): Promise<void>;
	simulatePreferenceVaultUnavailable(): Promise<void>;
	restorePreferenceVault(): Promise<void>;
}

interface DiagnosticsApiModule {
	createDiagnosticsTestHarness?: () => Promise<unknown>;
}

const diagnosticsPreferenceUpdateSchema = z.object({
	highContrastEnabled: z.boolean(),
	reducedMotionEnabled: z.boolean(),
	remoteProvidersEnabled: z.boolean(),
	consentSummary: z.string().max(240),
	expectedLastUpdatedAt: z.string().datetime().optional()
});

const errorResponseSchema = z.object({
	error: z.string(),
	message: z.string().max(240)
});

const storageUnavailableSchema = z.object({
	status: z.literal("session-only"),
	storageHealth: storageHealthAlertSchema
});

async function loadHarness(): Promise<DiagnosticsPreferenceTestHarness> {
	const module = (await import("../../src/api/diagnostics/index")) as DiagnosticsApiModule;
	const factory = module.createDiagnosticsTestHarness;
	expect(factory, "Expected createDiagnosticsTestHarness to expose diagnostics preference harness").toBeTypeOf("function");
	const harness = await factory!();
	assertPreferenceHarness(harness);
	return harness;
}

function assertPreferenceHarness(value: unknown): asserts value is DiagnosticsPreferenceTestHarness {
	if (!value || typeof value !== "object") {
		throw new Error("Diagnostics preference harness must be an object");
	}
	const harness = value as DiagnosticsPreferenceTestHarness;
	for (const method of [
		"app",
		"close",
		"loadPreferenceState",
		"seedPreferenceState",
		"simulatePreferenceVaultUnavailable",
		"restorePreferenceVault"
	] as const) {
		if (!(method in harness)) {
			throw new Error(`Diagnostics preference harness missing ${method}() helper`);
		}
	}
	if (typeof harness.app?.inject !== "function") {
		throw new Error("Diagnostics preference harness must expose Fastify inject helper");
	}
}

async function parseJson<T>(response: DiagnosticsTestResponse, schema: z.ZodSchema<T>) {
	const contentType = response.headers["content-type"] ?? "";
	expect(contentType).toContain("application/json");
	return schema.parse(JSON.parse(response.body) as unknown);
}

describe("Diagnostics preferences API contract", () => {
	let harness: DiagnosticsPreferenceTestHarness;

	beforeAll(async () => {
		harness = await loadHarness();
	});

	afterAll(async () => {
		await harness.app.close();
		await harness.close();
	});

	it("returns the persisted diagnostics preference record", async () => {
		const response = await harness.app.inject({
			method: "GET",
			url: "/internal/diagnostics/preferences"
		});

		expect(response.statusCode).toBe(200);
		const payload = await parseJson(response, diagnosticsPreferenceRecordSchema);
		expect(payload.remoteProvidersEnabled).toBe(false);
		expect(payload.updatedBy).toBe("main");
	});

	it("persists preference updates and returns the refreshed record", async () => {
		const existing = await harness.loadPreferenceState();

		const updatePayload = diagnosticsPreferenceUpdateSchema.parse({
			highContrastEnabled: true,
			reducedMotionEnabled: true,
			remoteProvidersEnabled: false,
			consentSummary: "Enabled accessibility toggles",
			expectedLastUpdatedAt: existing.lastUpdatedAt
		});

		const response = await harness.app.inject({
			method: "PUT",
			url: "/internal/diagnostics/preferences",
			payload: updatePayload
		});

		expect(response.statusCode).toBe(200);
		const payload = await parseJson(response, diagnosticsPreferenceRecordSchema);
		expect(payload.highContrastEnabled).toBe(true);
		expect(payload.lastUpdatedAt).not.toBe(existing.lastUpdatedAt);
	});

	it("rejects stale updates using optimistic concurrency", async () => {
		const existing = await harness.loadPreferenceState();

		const response = await harness.app.inject({
			method: "PUT",
			url: "/internal/diagnostics/preferences",
			payload: {
				highContrastEnabled: false,
				reducedMotionEnabled: false,
				remoteProvidersEnabled: false,
				consentSummary: "Attempted stale write",
				expectedLastUpdatedAt: "2020-01-01T00:00:00.000Z"
			}
		});

		expect(response.statusCode).toBe(409);
		const payload = await parseJson(response, errorResponseSchema);
		expect(payload.error).toBe("DIAGNOSTICS_PREFERENCES_STALE");
	});

	it("surfaces storage health alerts when the vault is unavailable", async () => {
		await harness.simulatePreferenceVaultUnavailable();

		const response = await harness.app.inject({
			method: "GET",
			url: "/internal/diagnostics/preferences"
		});

		expect(response.statusCode).toBe(503);
		const payload = await parseJson(response, storageUnavailableSchema);
		const alert: StorageHealthAlertPayload = payload.storageHealth;
		expect(alert.status).toBe("unavailable");
		expect(alert.reason).toBeDefined();

		await harness.restorePreferenceVault();
	});
});
