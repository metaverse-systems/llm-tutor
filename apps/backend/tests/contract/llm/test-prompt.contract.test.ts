import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
} from "./helpers.js";

const successResponseSchema = z
	.object({
		success: z.literal(true),
		data: TestPromptResultSchema,
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const errorResponseSchema = z
	.object({
		success: z.literal(true),
		data: TestPromptResultSchema,
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

const standardErrorSchema = z
	.object({
		error: z.enum(["NO_ACTIVE_PROFILE", "PROFILE_NOT_FOUND", "TIMEOUT"]),
		message: z.string().min(1),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: test prompt", () => {
	let harness: LlmContractTestHarness;
	const now = Date.now();

	const activeProfile = LLMProfileSchema.parse({
		id: "86b47dd2-39b7-4ac0-9c5f-bb8a0b2a6c9d",
		name: "Local llama.cpp",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:8080",
		apiKey: "sk-local",
		modelId: null,
		isActive: true,
		consentTimestamp: null,
		createdAt: now - 1_000,
		modifiedAt: now - 500
	});

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [activeProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.clearVault();
		await harness.seedVault(vault);
	});

	afterEach(async () => {
		await harness.close();
	});

	it("returns a successful test prompt result", async () => {
		const response = await harness.invoke("llm:profiles:test", {
			profileId: activeProfile.id,
			promptText: "Hello, can you respond?"
		});

		const parsed = successResponseSchema.parse(response);
		expect(parsed.data.profileId).toBe(activeProfile.id);
		expect(parsed.data.profileName).toBe(activeProfile.name);
		expect(parsed.data.success).toBe(true);
		expect(parsed.data.responseText).toEqual(expect.any(String));
		expect(parsed.data.responseText?.length).toBeLessThanOrEqual(500);
		expect(parsed.data.errorCode).toBeNull();
	});

	it("returns an error result payload on provider failure", async () => {
		const response = await harness.invoke("llm:profiles:test", {
			profileId: activeProfile.id,
			promptText: "Cause an error"
		});

		const errorResult = errorResponseSchema.parse(response);
		expect(errorResult.data.success).toBe(false);
		expect(errorResult.data.errorCode).toEqual(expect.any(String));
		if (errorResult.data.responseText !== null) {
			throw new Error("Failed prompts must not include response text");
		}
	});

	it("enforces NO_ACTIVE_PROFILE error when no active profile is set", async () => {
		await harness.clearVault();
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [{ ...activeProfile, isActive: false }],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.seedVault(vault);

		const response = await harness.invoke("llm:profiles:test", {});
		const error = standardErrorSchema.parse(response);
		expect(error.error).toBe("NO_ACTIVE_PROFILE");
	});

	it("returns PROFILE_NOT_FOUND for unknown profile ids", async () => {
		const response = await harness.invoke("llm:profiles:test", {
			profileId: "23f14e40-1969-4c51-9dd8-3c2eefec2f75"
		});

		const error = standardErrorSchema.parse(response);
		expect(error.error).toBe("PROFILE_NOT_FOUND");
	});

	it("returns TIMEOUT error when provider does not respond", async () => {
		const response = await harness.invoke("llm:profiles:test", {
			profileId: activeProfile.id,
			promptText: "Simulate timeout"
		});

		const error = standardErrorSchema.parse(response);
		expect(error.error).toBe("TIMEOUT");
	});
});
