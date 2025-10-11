import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { LLMProfileSchema } from "@metaverse-systems/llm-tutor-shared/llm";

import {
	loadLlmContractTestHarness,
	type LlmContractTestHarness
} from "./helpers.js";

const createProfileResponseSchema = z
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

const vaultWriteErrorSchema = z
	.object({
		error: z.literal("VAULT_WRITE_ERROR"),
		message: z.string().min(1),
		details: z.unknown().optional(),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: create profile", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
	});

	afterEach(async () => {
		await harness.close();
	});

	it("creates an Azure profile with redacted API key", async () => {
		const now = Date.now();
		const payload = {
			name: "Azure OpenAI Prod",
			providerType: "azure" as const,
			endpointUrl: "https://workspace.openai.azure.com",
			apiKey: "sk-live-azure",
			modelId: "gpt-4",
			consentTimestamp: now
		};

		const response = await harness.invoke("llm:profiles:create", payload);
		const parsed = createProfileResponseSchema.parse(response);

		expect(parsed.data.profile.providerType).toBe("azure");
		expect(parsed.data.profile.name).toBe(payload.name);
		expect(parsed.data.profile.consentTimestamp).toBe(payload.consentTimestamp);
		expect(parsed.data.profile.apiKey).toBe("***REDACTED***");
		expect(parsed.data.profile.id).toMatch(/[0-9a-fA-F-]{36}/);
	});

	it("requires consent timestamp for Azure providers", async () => {
		const payload = {
			name: "Azure Without Consent",
			providerType: "azure" as const,
			endpointUrl: "https://workspace.openai.azure.com",
			apiKey: "sk-missing-consent",
			modelId: "gpt-4",
			consentTimestamp: null
		};

		const response = await harness.invoke("llm:profiles:create", payload);
		const error = validationErrorSchema.parse(response);

		expect(error.error).toBe("VALIDATION_ERROR");
		expect(error.message).toMatch(/consent/i);
	});

	it("surfaces vault write failures as VAULT_WRITE_ERROR", async () => {
		await harness.simulateVaultWriteError(new Error("Disk full"));

		const payload = {
			name: "Custom Provider",
			providerType: "custom" as const,
			endpointUrl: "https://example.com/api",
			apiKey: "sk-custom",
			modelId: "custom-model",
			consentTimestamp: Date.now()
		};

		const response = await harness.invoke("llm:profiles:create", payload);
		const error = vaultWriteErrorSchema.parse(response);

		expect(error.error).toBe("VAULT_WRITE_ERROR");
		expect(error.message).toMatch(/disk/i);
	});
});
