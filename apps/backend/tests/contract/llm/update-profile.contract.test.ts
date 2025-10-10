import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	LLMProfileSchema,
	ProfileVaultSchema
} from "@metaverse-systems/llm-tutor-shared/llm";

import {
	loadLlmContractTestHarness,
	type LlmContractTestHarness,
	type ProfileVaultSeed
} from "./helpers.js";

const successResponseSchema = z
	.object({
		success: z.literal(true),
		data: z.object({
			profile: LLMProfileSchema,
			warning: z.string().optional()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const validationErrorSchema = z
	.object({
		error: z.literal("VALIDATION_ERROR"),
		message: z.string().min(1),
		details: z.unknown().optional(),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const profileNotFoundSchema = z
	.object({
		error: z.literal("PROFILE_NOT_FOUND"),
		message: z.string().min(1),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: update profile", () => {
	let harness: LlmContractTestHarness;
	const now = Date.now();

	const baseProfile = LLMProfileSchema.parse({
		id: "59c62a7d-8c9b-4864-a56e-6d57e4df2f6f",
		name: "Local llama.cpp",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:11434",
		apiKey: "sk-local",
		modelId: null,
		isActive: true,
		consentTimestamp: null,
		createdAt: now,
		modifiedAt: now
	});

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [baseProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.clearVault();
		await harness.seedVault(vault);
	});

	afterEach(async () => {
		await harness.close();
	});

	it("applies partial updates and redacts API keys", async () => {
		const payload = {
			id: baseProfile.id,
			name: "Local llama.cpp (renamed)",
			endpointUrl: "http://localhost:8081",
			apiKey: "sk-new-secret"
		};

		const response = await harness.invoke("llm:profiles:update", payload);
		const parsed = successResponseSchema.parse(response);

		expect(parsed.data.profile.name).toBe(payload.name);
		expect(parsed.data.profile.endpointUrl).toBe(payload.endpointUrl);
		expect(parsed.data.profile.apiKey).toBe("***REDACTED***");
		expect(parsed.data.profile.modifiedAt).toBeGreaterThanOrEqual(parsed.data.profile.createdAt);
	});

	it("validates payloads and surfaces validation errors", async () => {
		const response = await harness.invoke("llm:profiles:update", {
			id: baseProfile.id,
			name: ""
		});

		const error = validationErrorSchema.parse(response);
		expect(error.message).toMatch(/name/i);
	});

	it("returns PROFILE_NOT_FOUND for unknown IDs", async () => {
		const response = await harness.invoke("llm:profiles:update", {
			id: "d3c0f4c2-7ba1-4e5f-9c12-5212f0b1d3c8",
			name: "Ghost profile"
		});

		const error = profileNotFoundSchema.parse(response);
		expect(error.message).toMatch(/not found/i);
	});
});
