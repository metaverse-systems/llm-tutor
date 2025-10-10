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
			activeProfile: LLMProfileSchema,
			deactivatedProfileId: z.string().uuid().nullable()
		}),
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

describe("LLM contract: activate profile", () => {
	let harness: LlmContractTestHarness;
	const now = Date.now();

	const inactiveProfile = LLMProfileSchema.parse({
		id: "ac6d1efc-b956-4d14-bb3b-e9fa7d1e9c1e",
		name: "Azure Prod",
		providerType: "azure",
		endpointUrl: "https://workspace.openai.azure.com",
		apiKey: "sk-azure",
		modelId: "gpt-4",
		isActive: false,
		consentTimestamp: now,
		createdAt: now - 1_000,
		modifiedAt: now - 1_000
	});

	const currentlyActive = LLMProfileSchema.parse({
		id: "1a4f07c8-2578-44a0-bc9d-d06bf7dd03ed",
		name: "Local llama.cpp",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:8080",
		apiKey: "sk-local",
		modelId: null,
		isActive: true,
		consentTimestamp: null,
		createdAt: now - 2_000,
		modifiedAt: now - 1_500
	});

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [currentlyActive, inactiveProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.clearVault();
		await harness.seedVault(vault);
	});

	afterEach(async () => {
		await harness.close();
	});

	it("activates the requested profile and returns prior active id", async () => {
		const response = await harness.invoke("llm:profiles:activate", {
			id: inactiveProfile.id
		});

		const parsed = successResponseSchema.parse(response);
		expect(parsed.data.activeProfile.id).toBe(inactiveProfile.id);
		expect(parsed.data.activeProfile.apiKey).toBe("***REDACTED***");
		expect(parsed.data.deactivatedProfileId).toBe(currentlyActive.id);
	});

	it("returns PROFILE_NOT_FOUND for unknown profile ids", async () => {
		const response = await harness.invoke("llm:profiles:activate", {
			id: "6b7d0a30-4bca-430f-a35b-dfe12a4165cd"
		});

		const error = profileNotFoundSchema.parse(response);
		expect(error.message).toMatch(/not found/i);
	});
});
