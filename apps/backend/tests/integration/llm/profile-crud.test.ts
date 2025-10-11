import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
	LLMProfileSchema,
	ProfileVaultSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

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

const createResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			profile: LLMProfileSchema,
			warning: z.string().optional()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const updateResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			profile: LLMProfileSchema,
			warning: z.string().optional()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const activateResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			activeProfile: LLMProfileSchema,
			deactivatedProfileId: z.string().uuid().nullable()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const deleteResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			deletedId: z.string().uuid(),
			newActiveProfileId: z.string().uuid().nullable(),
			requiresUserSelection: z.boolean()
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

describe("LLM integration: profile CRUD workflow via HTTP routes", () => {
	let app: FastifyInstance | null = null;

	beforeEach(async () => {
		// Import and create backend app with profile routes
		const module = await import("../../../src/api/diagnostics/index.js");
		const instance = await module.createDiagnosticsApp();
		app = instance;
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = null;
		}
	});

	async function listProfiles() {
		if (!app) throw new Error("App not initialized");
		const response = await app.inject({
			method: "GET",
			url: "/api/llm/profiles"
		});
		expect(response.statusCode).toBe(200);
		const parsed = listResponseSchema.parse(JSON.parse(response.body));
		return parsed;
	}

	async function expectDiagnosticsBreadcrumb(correlationId: string) {
		if (!app) throw new Error("App not initialized");
		// Request diagnostics export and verify breadcrumb with matching correlationId exists
		const exportResponse = await app.inject({
			method: "GET",
			url: "/internal/diagnostics/export"
		});
		expect(exportResponse.statusCode).toBe(200);
		const lines = exportResponse.body.trim().split("\n");
		const records = lines.map(line => JSON.parse(line));
		const breadcrumb = records.find((r: { correlationId?: string }) => r.correlationId === correlationId);
		expect(breadcrumb).toBeDefined();
		diagnosticsEventSchema.parse(breadcrumb);
	}

	it("supports creating, updating, activating, and deleting profiles via HTTP", async () => {
		if (!app) throw new Error("App not initialized");
		
		// Create local llama.cpp profile via POST
		const localCreateResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: "Local llama.cpp",
					providerType: "llama.cpp",
					endpointUrl: "http://localhost:8080",
					apiKey: "",
					modelId: null,
					consentTimestamp: null
				},
				context: { operatorId: "test-user" }
			}
		});
		expect(localCreateResponse.statusCode).toBe(201);
		const localCreateParsed = createResponseSchema.parse(JSON.parse(localCreateResponse.body));
		const localProfile = localCreateParsed.data.profile;
		expect(localProfile.isActive).toBe(true);
		
		// Verify diagnostics breadcrumb was emitted
		const createCorrelationId = (JSON.parse(localCreateResponse.body) as { correlationId?: string }).correlationId;
		if (createCorrelationId) {
			await expectDiagnosticsBreadcrumb(createCorrelationId);
		}

		// Create Azure profile via POST
		const azureCreateResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: "Azure OpenAI Prod",
					providerType: "azure",
					endpointUrl: "https://workspace.openai.azure.com",
					apiKey: "sk-azure",
					modelId: "gpt-4",
					consentTimestamp: Date.now()
				},
				context: { operatorId: "test-user" }
			}
		});
		expect(azureCreateResponse.statusCode).toBe(201);
		const azureCreateParsed = createResponseSchema.parse(JSON.parse(azureCreateResponse.body));
		const azureProfile = azureCreateParsed.data.profile;
		expect(azureProfile.providerType).toBe("azure");

		// List profiles via GET
		const afterCreate = await listProfiles();
		expect(afterCreate.data.profiles).toHaveLength(2);
		const activeCount = afterCreate.data.profiles.filter((profile) => profile.isActive).length;
		expect(activeCount).toBe(1);

		// Update profile via PATCH
		const updateResponse = await app.inject({
			method: "PATCH",
			url: `/api/llm/profiles/${azureProfile.id}`,
			payload: {
				changes: {
					name: "Azure Sandbox",
					modelId: "gpt-4.1"
				}
			}
		});
		expect(updateResponse.statusCode).toBe(200);
		const updatedProfile = updateResponseSchema.parse(JSON.parse(updateResponse.body)).data.profile;
		expect(updatedProfile.name).toBe("Azure Sandbox");
		expect(updatedProfile.modelId).toBe("gpt-4.1");

		// Verify diagnostics breadcrumb
		const updateCorrelationId = (JSON.parse(updateResponse.body) as { correlationId?: string }).correlationId;
		if (updateCorrelationId) {
			await expectDiagnosticsBreadcrumb(updateCorrelationId);
		}

		// Activate profile via POST
		const activateResponse = await app.inject({
			method: "POST",
			url: `/api/llm/profiles/${azureProfile.id}/activate`,
			payload: { force: false }
		});
		expect(activateResponse.statusCode).toBe(200);
		const activation = activateResponseSchema.parse(JSON.parse(activateResponse.body)).data;
		expect(activation.activeProfile.id).toBe(azureProfile.id);
		expect(activation.deactivatedProfileId).toBe(localProfile.id);

		// Verify diagnostics breadcrumb
		const activateCorrelationId = (JSON.parse(activateResponse.body) as { correlationId?: string }).correlationId;
		if (activateCorrelationId) {
			await expectDiagnosticsBreadcrumb(activateCorrelationId);
		}

		// Verify active state via GET
		const afterActivate = await listProfiles();
		const activeIds = afterActivate.data.profiles.filter((profile) => profile.isActive).map((profile) => profile.id);
		expect(activeIds).toEqual([azureProfile.id]);

		// Delete profile via DELETE
		const deleteResponse = await app.inject({
			method: "DELETE",
			url: `/api/llm/profiles/${azureProfile.id}`,
			payload: {
				successorProfileId: localProfile.id
			}
		});
		expect(deleteResponse.statusCode).toBe(200);
		const deletion = deleteResponseSchema.parse(JSON.parse(deleteResponse.body)).data;
		expect(deletion.deletedId).toBe(azureProfile.id);
		expect(deletion.newActiveProfileId).toBe(localProfile.id);
		expect(deletion.requiresUserSelection).toBe(false);

		// Verify diagnostics breadcrumb
		const deleteCorrelationId = (JSON.parse(deleteResponse.body) as { correlationId?: string }).correlationId;
		if (deleteCorrelationId) {
			await expectDiagnosticsBreadcrumb(deleteCorrelationId);
		}

		// Verify final state via GET
		const finalState = await listProfiles();
		expect(finalState.data.profiles).toHaveLength(1);
		expect(finalState.data.activeProfileId).toBe(localProfile.id);
	});

	it("requires alternate selection when deleting the active profile without replacement via HTTP", async () => {
		if (!app) throw new Error("App not initialized");
		
		// Create first profile
		const createOneResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: "Local llama.cpp",
					providerType: "llama.cpp",
					endpointUrl: "http://localhost:8080",
					apiKey: "",
					modelId: null,
					consentTimestamp: null
				},
				context: { operatorId: "test-user" }
			}
		});
		const primaryProfile = createResponseSchema.parse(JSON.parse(createOneResponse.body)).data.profile;

		// Create second profile
		const createTwoResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: "Azure",
					providerType: "azure",
					endpointUrl: "https://workspace.openai.azure.com",
					apiKey: "sk-azure",
					modelId: "gpt-4",
					consentTimestamp: Date.now()
				},
				context: { operatorId: "test-user" }
			}
		});
		const secondaryProfile = createResponseSchema.parse(JSON.parse(createTwoResponse.body)).data.profile;

		// Activate secondary profile
		await app.inject({
			method: "POST",
			url: `/api/llm/profiles/${secondaryProfile.id}/activate`,
			payload: { force: false }
		});

		// Delete active profile without providing successor
		const deletionResponse = await app.inject({
			method: "DELETE",
			url: `/api/llm/profiles/${secondaryProfile.id}`,
			payload: {}
		});
		expect(deletionResponse.statusCode).toBe(200);
		const deleteResult = deleteResponseSchema.parse(JSON.parse(deletionResponse.body)).data;

		expect(deleteResult.deletedId).toBe(secondaryProfile.id);
		expect(deleteResult.newActiveProfileId).toBeNull();
		expect(deleteResult.requiresUserSelection).toBe(true);

		// Verify vault state
		const vaultState = await listProfiles();
		const activeProfiles = vaultState.data.profiles.filter((profile) => profile.isActive);
		expect(activeProfiles).toHaveLength(0);
		expect(vaultState.data.profiles.map((profile) => profile.id)).toContain(primaryProfile.id);
	});
});
