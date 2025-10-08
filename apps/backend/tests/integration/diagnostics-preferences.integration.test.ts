import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { diagnosticsPreferenceRecordSchema } from "@metaverse-systems/llm-tutor-shared";

describe("Diagnostics preferences integration", () => {
	let app: FastifyInstance | null = null;

	afterEach(async () => {
		if (app) {
			await app.close();
			app = null;
		}
	});

	it("exposes preference endpoints and synchronises snapshots", async () => {
		const module = await import("../../src/api/diagnostics/index");
		const instance = await module.createDiagnosticsApp();
		app = instance;

		const initialGet = await instance.inject({ method: "GET", url: "/internal/diagnostics/preferences" });
		expect(initialGet.statusCode).toBe(200);
		const initial = diagnosticsPreferenceRecordSchema.parse(JSON.parse(initialGet.body));
		expect(initial.remoteProvidersEnabled).toBe(false);

		const updateResponse = await instance.inject({
			method: "PUT",
			url: "/internal/diagnostics/preferences",
			payload: {
				highContrastEnabled: true,
				reducedMotionEnabled: true,
				remoteProvidersEnabled: false,
				consentSummary: "Enabled accessibility toggles",
				expectedLastUpdatedAt: initial.lastUpdatedAt
			}
		});

		expect(updateResponse.statusCode).toBe(200);

		const summaryResponse = await instance.inject({ method: "GET", url: "/internal/diagnostics/summary" });
		expect(summaryResponse.statusCode).toBe(200);
		const summary = JSON.parse(summaryResponse.body) as { activePreferences: { highContrastEnabled: boolean } };
		expect(summary.activePreferences.highContrastEnabled).toBe(true);
	});

	it("embeds storage health alerts into diagnostics export", async () => {
		const module = await import("../../src/api/diagnostics/index");
		const instance = await module.createDiagnosticsApp();
		app = instance;

		await instance.inject({ method: "PUT", url: "/internal/diagnostics/preferences", payload: {
			highContrastEnabled: false,
			reducedMotionEnabled: false,
			remoteProvidersEnabled: false,
			consentSummary: "Simulate storage failure"
		}});

		await instance.inject({ method: "POST", url: "/internal/diagnostics/refresh" });

		const exportResponse = await instance.inject({ method: "GET", url: "/internal/diagnostics/export" });
		expect(exportResponse.statusCode).toBe(200);
		const lines = exportResponse.body.trim().split("\n");
		const record = JSON.parse(lines.at(-1) ?? "{}") as { activePreferences?: { storageHealth?: unknown } };
		expect(record.activePreferences).toBeDefined();
		expect(record.activePreferences?.storageHealth).toBeDefined();
	});
});
