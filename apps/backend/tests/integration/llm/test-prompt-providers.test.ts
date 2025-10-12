import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import nock from "nock";
import { z } from "zod";
import {
	LLMProfileSchema,
	TestPromptResultSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

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

describe("LLM integration: test prompt providers via HTTP routes", () => {
	let app: FastifyInstance | null = null;

	beforeEach(async () => {
		nock.cleanAll();
		nock.disableNetConnect();
		
		// Import and create backend app with profile routes
		const module = await import("../../../src/api/diagnostics/index.js");
		const instance = await module.createDiagnosticsApp();
		app = instance;
	});

	afterEach(async () => {
		nock.cleanAll();
		nock.enableNetConnect();
		if (app) {
			await app.close();
			app = null;
		}
	});

	it("returns a successful result for llama.cpp with latency measurement via HTTP", async () => {
		if (!app) throw new Error("App not initialized");
		
		// Create llama.cpp profile via POST
		const createResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: llamaProfile.name,
					providerType: llamaProfile.providerType,
					endpointUrl: llamaProfile.endpointUrl,
					apiKey: llamaProfile.apiKey,
					modelId: llamaProfile.modelId,
					consentTimestamp: llamaProfile.consentTimestamp
				},
				context: { operatorId: "test-user" }
			}
		});
		const createdProfile = LLMProfileSchema.parse(JSON.parse(createResponse.body).data.profile);

		const longResponse = "a".repeat(600);

		nock("http://localhost:8080")
			.post("/v1/chat/completions", (body: unknown) => {
				if (!body || typeof body !== "object") {
					return false;
				}

				const payload = body as { messages?: Array<{ role?: string; content?: unknown }> };
				const messages = Array.isArray(payload.messages) ? payload.messages : [];
				const userMessage = messages.find((message) => message?.role === "user");
				return typeof userMessage?.content === "string" && userMessage.content === "Hello, can you respond?";
			})
			.delay(234)
			.reply(200, {
				id: "chatcmpl-success",
				object: "chat.completion",
				created: Math.floor(now / 1_000),
				model: "llama-2-7b-chat",
				choices: [
					{
						message: {
							role: "assistant",
							content: longResponse
						},
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

		// POST to test endpoint
		const response = await app.inject({
			method: "POST",
			url: `/api/llm/profiles/${createdProfile.id}/test`,
			payload: {
				promptOverride: "Hello, can you respond?"
			}
		});
		expect(response.statusCode).toBe(200);

		const result = successEnvelopeSchema.parse(JSON.parse(response.body));
		expect(result.data.success).toBe(true);
		expect(result.data.profileId).toBe(createdProfile.id);
		expect(result.data.providerType).toBe("llama.cpp");
		expect(result.data.latencyMs).toBeGreaterThanOrEqual(200);
		expect(result.data.totalTimeMs).toBeGreaterThanOrEqual(result.data.latencyMs ?? 0);
		expect(result.data.responseText).not.toBeNull();
		expect(result.data.responseText?.length).toBeLessThanOrEqual(500);
		expect(result.data.errorCode).toBeNull();
	});

	it("maps Azure 401 responses to error results via HTTP", async () => {
		if (!app) throw new Error("App not initialized");
		
		// Create Azure profile via POST
		const createResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: azureProfile.name,
					providerType: azureProfile.providerType,
					endpointUrl: azureProfile.endpointUrl,
					apiKey: azureProfile.apiKey,
					modelId: azureProfile.modelId,
					consentTimestamp: azureProfile.consentTimestamp
				},
				context: { operatorId: "test-user" }
			}
		});
		const createdProfile = LLMProfileSchema.parse(JSON.parse(createResponse.body).data.profile);

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

		// POST to test endpoint
		const response = await app.inject({
			method: "POST",
			url: `/api/llm/profiles/${createdProfile.id}/test`,
			payload: {
				promptOverride: "Hello, can you respond?"
			}
		});
		expect(response.statusCode).toBe(200);

		const result = failureEnvelopeSchema.parse(JSON.parse(response.body));
		expect(result.data.success).toBe(false);
		expect(result.data.errorCode).toBe("401");
		expect(result.data.errorMessage).toContain("invalid subscription key");
		expect(result.data.responseText).toBeNull();
		expect(result.data.latencyMs).toBeNull();
	});

	it("records timeout errors when providers do not respond via HTTP (30s timeout)", async () => {
		if (!app) throw new Error("App not initialized");
		
		// Create llama.cpp profile via POST
		const createResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: llamaProfile.name,
					providerType: llamaProfile.providerType,
					endpointUrl: llamaProfile.endpointUrl,
					apiKey: llamaProfile.apiKey,
					modelId: llamaProfile.modelId,
					consentTimestamp: llamaProfile.consentTimestamp
				},
				context: { operatorId: "test-user" }
			}
		});
		const createdProfile = LLMProfileSchema.parse(JSON.parse(createResponse.body).data.profile);

		nock("http://localhost:8080")
			.post("/v1/chat/completions")
			.replyWithError({ code: "ETIMEDOUT", message: "Request timed out" });

		// POST to test endpoint with custom timeout
		const response = await app.inject({
			method: "POST",
			url: `/api/llm/profiles/${createdProfile.id}/test`,
			payload: {
				promptOverride: "Please hang",
				timeoutMs: 2000 // Use shorter timeout for faster test
			}
		});
		expect(response.statusCode).toBe(200);

		const result = failureEnvelopeSchema.parse(JSON.parse(response.body));
		expect(result.data.success).toBe(false);
		expect(result.data.errorCode).toBe("TIMEOUT");
		expect(result.data.errorMessage).toContain("timed out");
		expect(result.data.responseText).toBeNull();
	});
});
