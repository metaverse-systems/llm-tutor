import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import nock from "nock";
import { z } from "zod";
import {
	LLMProfileSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

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

describe("LLM integration: auto-discovery via HTTP /discover endpoint", () => {
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
		if (app) {
			await app.close();
			app = null;
		}
		nock.cleanAll();
		nock.enableNetConnect();
	});

	it("creates a default profile when llama.cpp is detected via HTTP /discover", async () => {
		if (!app) throw new Error("App not initialized");
		
		nock("http://localhost:8080").get("/health").reply(200, { status: "ok" });
		nock("http://localhost:8000").get("/health").reply(500, { status: "error" });
		nock("http://localhost:11434").get("/health").replyWithError({ code: "ECONNREFUSED" });

		// POST to /discover endpoint
		const response = await app.inject({
			method: "POST",
			url: "/api/llm/profiles/discover",
			payload: {
				scope: {
					strategy: "local",
					includeExisting: false
				}
			}
		});
		expect(response.statusCode).toBe(200);
		const parsed = discoveryResponseSchema.parse(JSON.parse(response.body));

		expect(parsed.data.discovered).toBe(true);
		expect(parsed.data.discoveredUrl).toBe("http://localhost:8080");
		expect(parsed.data.profileCreated).toBe(true);
		expect(parsed.data.profileId).toMatch(/[0-9a-f-]{36}/i);
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);

		// Verify profile was created via GET
		const listResponse = await app.inject({
			method: "GET",
			url: "/api/llm/profiles"
		});
		const list = listResponseSchema.parse(JSON.parse(listResponse.body));
		const createdProfile = list.data.profiles.find((profile) => profile.id === parsed.data.profileId);
		expect(createdProfile).toBeDefined();
		expect(createdProfile?.name).toBe("Local llama.cpp");
		expect(createdProfile?.endpointUrl).toBe("http://localhost:8080");
		expect(createdProfile?.providerType).toBe("llama.cpp");
		expect(list.data.activeProfileId).toBe(parsed.data.profileId);

		// Verify diagnostics breadcrumb via export
		const exportResponse = await app.inject({
			method: "GET",
			url: "/internal/diagnostics/export"
		});
		expect(exportResponse.statusCode).toBe(200);
		const lines = exportResponse.body.trim().split("\n");
		const records = lines.map(line => JSON.parse(line));
		const discoveryBreadcrumb = records.find((r: { type?: string }) => r.type === "llm_autodiscovery");
		expect(discoveryBreadcrumb).toBeDefined();
		diagnosticsEventSchema.parse(discoveryBreadcrumb);
	});

	it("records a negative discovery result when no servers respond via HTTP /discover", async () => {
		if (!app) throw new Error("App not initialized");
		
		nock("http://localhost:8080").get("/health").replyWithError({ code: "ECONNREFUSED" });
		nock("http://localhost:8000").get("/health").reply(503, { status: "unavailable" });
		nock("http://localhost:11434").get("/health").reply(404, { status: "not_found" });

		// POST to /discover endpoint
		const response = await app.inject({
			method: "POST",
			url: "/api/llm/profiles/discover",
			payload: {
				scope: {
					strategy: "local"
				}
			}
		});
		expect(response.statusCode).toBe(200);
		const parsed = discoveryResponseSchema.parse(JSON.parse(response.body));

		expect(parsed.data.discovered).toBe(false);
		expect(parsed.data.discoveredUrl).toBeNull();
		expect(parsed.data.profileCreated).toBe(false);
		expect(parsed.data.profileId).toBeNull();
		expect(parsed.data.probedPorts).toEqual([8080, 8000, 11434]);

		// Verify vault remains empty via GET
		const vaultStateResponse = await app.inject({
			method: "GET",
			url: "/api/llm/profiles"
		});
		const vault = listResponseSchema.parse(JSON.parse(vaultStateResponse.body));
		expect(vault.data.profiles).toHaveLength(0);
		expect(vault.data.activeProfileId).toBeNull();

		// Verify diagnostics breadcrumb via export
		const exportResponse = await app.inject({
			method: "GET",
			url: "/internal/diagnostics/export"
		});
		expect(exportResponse.statusCode).toBe(200);
		const lines = exportResponse.body.trim().split("\n");
		const records = lines.map(line => JSON.parse(line));
		const discoveryBreadcrumb = records.find((r: { type?: string }) => r.type === "llm_autodiscovery");
		expect(discoveryBreadcrumb).toBeDefined();
		diagnosticsEventSchema.parse(discoveryBreadcrumb);
	});

	it("validates conflict deduplication when discovering existing endpoints", async () => {
		if (!app) throw new Error("App not initialized");
		
		// First create an existing profile via POST
		const existingProfileResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles",
			payload: {
				profile: {
					name: "Existing llama.cpp",
					providerType: "llama.cpp",
					endpointUrl: "http://localhost:8080",
					apiKey: "",
					modelId: null,
					consentTimestamp: null
				},
				context: { operatorId: "test-user" }
			}
		});
		expect(existingProfileResponse.statusCode).toBe(201);

		// Mock the discovery to find same endpoint
		nock("http://localhost:8080").get("/health").reply(200, { status: "ok" });
		nock("http://localhost:8000").get("/health").replyWithError({ code: "ECONNREFUSED" });
		nock("http://localhost:11434").get("/health").replyWithError({ code: "ECONNREFUSED" });

		// POST to /discover with includeExisting to detect conflicts
		const discoveryResponse = await app.inject({
			method: "POST",
			url: "/api/llm/profiles/discover",
			payload: {
				scope: {
					strategy: "local",
					includeExisting: true
				}
			}
		});
		expect(discoveryResponse.statusCode).toBe(200);
		const parsed = discoveryResponseSchema.parse(JSON.parse(discoveryResponse.body));

		// Should detect the endpoint but not create duplicate
		expect(parsed.data.discovered).toBe(true);
		expect(parsed.data.discoveredUrl).toBe("http://localhost:8080");
		expect(parsed.data.profileCreated).toBe(false); // Should not create duplicate
		
		// Verify only one profile exists (no duplicate)
		const listResponse = await app.inject({
			method: "GET",
			url: "/api/llm/profiles"
		});
		const list = listResponseSchema.parse(JSON.parse(listResponse.body));
		expect(list.data.profiles).toHaveLength(1);
		expect(list.data.profiles[0].name).toBe("Existing llama.cpp");
	});
});
