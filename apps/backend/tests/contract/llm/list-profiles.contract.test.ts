import { beforeEach, afterEach, describe, expect, it } from "vitest";
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
			profiles: z.array(LLMProfileSchema),
			encryptionAvailable: z.boolean(),
			activeProfileId: z.string().uuid().nullable()
		}),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const vaultReadErrorSchema = z
	.object({
		error: z.literal("VAULT_READ_ERROR"),
		message: z.string().min(1),
		details: z.unknown().optional(),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: list profiles", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
	});

	afterEach(async () => {
		await harness.close();
	});

	it("returns all profiles with redacted API keys", async () => {
		const now = Date.now();

		const localProfile = LLMProfileSchema.parse({
			id: "a5c2b3d4-e5f6-4711-a99b-1c2d3e4f5a6b",
			name: "Local llama.cpp",
			providerType: "llama.cpp",
			endpointUrl: "http://localhost:8080",
			apiKey: "sk-local",
			modelId: null,
			isActive: true,
			consentTimestamp: null,
			createdAt: now,
			modifiedAt: now
		});

		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [localProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});

		await harness.clearVault();
		await harness.seedVault(vault);

		const response = await harness.invoke("llm:profiles:list");
		const parsed = successResponseSchema.parse(response);

		expect(parsed.data.profiles).toHaveLength(1);
		const [profile] = parsed.data.profiles;
		expect(profile.id).toBe(localProfile.id);
		expect(profile.apiKey).toBe("***REDACTED***");
		expect(parsed.data.encryptionAvailable).toBe(true);
		expect(parsed.data.activeProfileId).toBe(localProfile.id);
	});

	it("returns VAULT_READ_ERROR when vault cannot be read", async () => {
		await harness.clearVault();
		await harness.simulateVaultReadError(new Error("Corrupted vault"));

		const response = await harness.invoke("llm:profiles:list");
		const error = vaultReadErrorSchema.parse(response);

		expect(error.error).toBe("VAULT_READ_ERROR");
		expect(error.message).toMatch(/corrupted/i);
	});
});
