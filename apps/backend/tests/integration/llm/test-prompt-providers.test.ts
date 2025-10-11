import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { z } from "zod";
import {
	LLMProfileSchema,
	ProfileVaultSchema,
	TestPromptResultSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

import {
	loadLlmContractTestHarness,
	type LlmContractTestHarness,
	type ProfileVaultSeed
} from "../../contract/llm/helpers.js";

const successEnvelopeSchema = z
	.object({
		success: z.literal(true),
		data: TestPromptResultSchema,
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const failureEnvelopeSchema = z
	.object({
		success: z.literal(true),
		data: TestPromptResultSchema,
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const now = Date.now();

const llamaProfile = LLMProfileSchema.parse({
	id: "f5e1778f-1a25-4b79-a83a-073de27df9cf",
	name: "Local llama.cpp",
	providerType: "llama.cpp",
	endpointUrl: "http://localhost:8080",
	apiKey: "sk-local",
	modelId: null,
	isActive: true,
	consentTimestamp: null,
	createdAt: now - 5_000,
	modifiedAt: now - 4_000
});

const azureProfile = LLMProfileSchema.parse({
	id: "b16c2e3a-8282-4d52-9fce-8a0f4e7c5f94",
	name: "Azure OpenAI",
	providerType: "azure",
	endpointUrl: "https://workspace.openai.azure.com/openai/deployments/gpt-4",
	apiKey: "sk-azure-test",
	modelId: "gpt-4",
	isActive: true,
	consentTimestamp: now - 10_000,
	createdAt: now - 20_000,
	modifiedAt: now - 15_000
});

describe("LLM integration: test prompt providers", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		nock.cleanAll();
		nock.disableNetConnect();
		harness = await loadLlmContractTestHarness();
		await harness.clearVault();
	});

	afterEach(async () => {
		nock.cleanAll();
		nock.enableNetConnect();
		await harness.close();
	});

	it("returns a successful result for llama.cpp with latency measurement", async () => {
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [llamaProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.seedVault(vault);

		const longResponse = "a".repeat(600);

		nock("http://localhost:8080")
			.post("/v1/completions", (body: unknown) => {
				if (!body || typeof body !== "object") {
					return false;
				}

				return (body as { prompt?: unknown }).prompt === "Hello, can you respond?";
			})
			.delay(234)
			.reply(200, {
				id: "cmpl-success",
				object: "text_completion",
				created: Math.floor(now / 1_000),
				model: "llama-2-7b-chat",
				choices: [
					{
						text: longResponse,
						index: 0,
						finish_reason: "stop",
						logprobs: null
					}
				],
				usage: {
					prompt_tokens: 12,
					completion_tokens: 20,
					total_tokens: 32
				}
			});

		const response = await harness.invoke("llm:profiles:test", {
			profileId: llamaProfile.id,
			promptText: "Hello, can you respond?"
		});

		const result = successEnvelopeSchema.parse(response);
		expect(result.data.success).toBe(true);
		expect(result.data.profileId).toBe(llamaProfile.id);
		expect(result.data.providerType).toBe("llama.cpp");
		expect(result.data.latencyMs).toBeGreaterThanOrEqual(200);
		expect(result.data.totalTimeMs).toBeGreaterThanOrEqual(result.data.latencyMs ?? 0);
		expect(result.data.responseText).not.toBeNull();
		expect(result.data.responseText?.length).toBeLessThanOrEqual(500);
		expect(result.data.errorCode).toBeNull();
	});

	it("maps Azure 401 responses to error results", async () => {
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [azureProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.seedVault(vault);

		nock("https://workspace.openai.azure.com")
			.post("/openai/deployments/gpt-4/chat/completions")
			.query({ "api-version": "2024-02-15-preview" })
			.matchHeader("api-key", "sk-azure-test")
			.matchHeader("content-type", "application/json")
			.reply(401, {
				error: {
					code: "401",
					message: "Access denied due to invalid subscription key or wrong API endpoint."
				}
			});

		const response = await harness.invoke("llm:profiles:test", {
			profileId: azureProfile.id,
			promptText: "Hello, can you respond?"
		});

		const result = failureEnvelopeSchema.parse(response);
		expect(result.data.success).toBe(false);
		expect(result.data.errorCode).toBe("401");
		expect(result.data.errorMessage).toContain("invalid subscription key");
		expect(result.data.responseText).toBeNull();
		expect(result.data.latencyMs).toBeNull();
	});

	it("records timeout errors when providers do not respond", async () => {
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [llamaProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.seedVault(vault);

		nock("http://localhost:8080")
			.post("/v1/completions")
			.replyWithError({ code: "ETIMEDOUT", message: "Request timed out" });

		const response = await harness.invoke("llm:profiles:test", {
			profileId: llamaProfile.id,
			promptText: "Please hang"
		});

		const result = failureEnvelopeSchema.parse(response);
		expect(result.data.success).toBe(false);
		expect(result.data.errorCode).toBe("TIMEOUT");
		expect(result.data.errorMessage).toContain("timed out");
		expect(result.data.responseText).toBeNull();
	});
});
