import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { z } from "zod";
import {
	LLMProfileSchema,
	ProfileVaultSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

import {
	loadLlmContractTestHarness,
	type LlmContractTestHarness,
	type ProfileVaultSeed
} from "../../contract/llm/helpers.js";

const discoveryResponseSchema = z
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

const listResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			profiles: z.array(LLMProfileSchema),
			encryptionAvailable: z.boolean(),
			activeProfileId: z.string().uuid().nullable()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const diagnosticsEventSchema = z
	.object({
		type: z.string(),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM integration: auto-discovery", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		nock.cleanAll();
		nock.disableNetConnect();
		harness = await loadLlmContractTestHarness();
		await harness.clearVault();
	});

	afterEach(async () => {
		await harness.close();
		nock.cleanAll();
		nock.enableNetConnect();
	});

	it("creates a default profile when llama.cpp is detected", async () => {
		nock("http://localhost:8080").get("/health").reply(200, { status: "ok" });
		nock("http://localhost:8000").get("/health").reply(500, { status: "error" });
		nock("http://localhost:11434").get("/health").replyWithError({ code: "ECONNREFUSED" });

		const response = await harness.invoke("llm:profiles:discover", { force: true });
		const parsed = discoveryResponseSchema.parse(response);

		expect(parsed.data.discovered).toBe(true);
		expect(parsed.data.discoveredUrl).toBe("http://localhost:8080");
		expect(parsed.data.profileCreated).toBe(true);
		expect(parsed.data.profileId).toMatch(/[0-9a-f-]{36}/i);
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);

		const listResponse = await harness.invoke("llm:profiles:list");
		const list = listResponseSchema.parse(listResponse);
		const createdProfile = list.data.profiles.find((profile) => profile.id === parsed.data.profileId);
		expect(createdProfile).toBeDefined();
		expect(createdProfile?.name).toBe("Local llama.cpp");
		expect(createdProfile?.endpointUrl).toBe("http://localhost:8080");
		expect(createdProfile?.providerType).toBe("llama.cpp");
		expect(list.data.activeProfileId).toBe(parsed.data.profileId);

		if (!harness.readDiagnosticsEvents) {
			throw new Error("LLM contract test harness must expose readDiagnosticsEvents()");
		}

		const events = await harness.readDiagnosticsEvents({ type: "llm_autodiscovery" });
		expect(Array.isArray(events)).toBe(true);
		expect(events.length).toBeGreaterThan(0);
		const latest = diagnosticsEventSchema.parse(events.at(-1));
		expect(latest.type).toBe("llm_autodiscovery");
	});

	it("records a negative discovery result when no servers respond", async () => {
		nock("http://localhost:8080").get("/health").replyWithError({ code: "ECONNREFUSED" });
		nock("http://localhost:8000").get("/health").reply(503, { status: "unavailable" });
		nock("http://localhost:11434").get("/health").reply(404, { status: "not_found" });

		const response = await harness.invoke("llm:profiles:discover");
		const parsed = discoveryResponseSchema.parse(response);

		expect(parsed.data.discovered).toBe(false);
		expect(parsed.data.discoveredUrl).toBeNull();
		expect(parsed.data.profileCreated).toBe(false);
		expect(parsed.data.profileId).toBeNull();
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);

		const vaultState = await harness.invoke("llm:profiles:list");
		const vault = listResponseSchema.parse(vaultState);
		expect(vault.data.profiles).toHaveLength(0);
		expect(vault.data.activeProfileId).toBeNull();

		if (!harness.readDiagnosticsEvents) {
			throw new Error("LLM contract test harness must expose readDiagnosticsEvents()");
		}

		const events = await harness.readDiagnosticsEvents({ type: "llm_autodiscovery" });
		expect(events.length).toBeGreaterThan(0);
		const latest = diagnosticsEventSchema.parse(events.at(-1));
		expect(latest.type).toBe("llm_autodiscovery");
	});
});
