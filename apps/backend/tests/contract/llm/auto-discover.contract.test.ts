import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { loadLlmContractTestHarness, type LlmContractTestHarness } from "./helpers.js";

const successResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			discovered: z.boolean(),
			discoveredUrl: z.string().url().nullable(),
			profileCreated: z.boolean(),
			profileId: z.string().uuid().nullable(),
			probedPorts: z.array(z.number().int().positive())
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const discoveryErrorSchema = z
	.object({
		error: z.literal("DISCOVERY_ERROR"),
		message: z.string().min(1),
		details: z.unknown().optional(),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: auto-discover profiles", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
	});

	afterEach(async () => {
		await harness.close();
	});

	it("returns discovery results when a local server is found", async () => {
		if (!harness.simulateDiscoveryResult) {
			throw new Error("LLM contract test harness must implement simulateDiscoveryResult()");
		}

		await harness.simulateDiscoveryResult({
			discovered: true,
			discoveredUrl: "http://localhost:8080",
			profileCreated: true,
			profileId: "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
			probedPorts: [8080, 8000, 11434]
		});

		const response = await harness.invoke("llm:profiles:discover", { force: true });
		const parsed = successResponseSchema.parse(response);

		expect(parsed.data.discovered).toBe(true);
		expect(parsed.data.discoveredUrl).toBe("http://localhost:8080");
		expect(parsed.data.profileCreated).toBe(true);
		expect(parsed.data.profileId).toBe("c9bf9e57-1685-4c89-bafb-ff5af830be8a");
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);
	});

	it("returns a no-discovery result when all probes fail", async () => {
		if (!harness.simulateDiscoveryResult) {
			throw new Error("LLM contract test harness must implement simulateDiscoveryResult()");
		}

		await harness.simulateDiscoveryResult({
			discovered: false,
			discoveredUrl: null,
			profileCreated: false,
			profileId: null,
			probedPorts: [8080, 8000, 11434]
		});

		const response = await harness.invoke("llm:profiles:discover");
		const parsed = successResponseSchema.parse(response);

		expect(parsed.data.discovered).toBe(false);
		expect(parsed.data.discoveredUrl).toBeNull();
		expect(parsed.data.profileCreated).toBe(false);
		expect(parsed.data.profileId).toBeNull();
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);
	});

	it("returns DISCOVERY_ERROR when probing fails fatally", async () => {
		if (!harness.simulateDiscoveryError) {
			throw new Error("LLM contract test harness must implement simulateDiscoveryError()");
		}

		await harness.simulateDiscoveryError(new Error("Network stack unavailable"));

		const response = await harness.invoke("llm:profiles:discover", { force: true });
		const error = discoveryErrorSchema.parse(response);

		expect(error.message).toMatch(/network stack unavailable/i);
	});
});
