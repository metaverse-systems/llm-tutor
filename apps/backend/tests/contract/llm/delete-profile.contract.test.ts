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
			deletedId: z.string().uuid(),
			newActiveProfileId: z.string().uuid().nullable(),
			requiresUserSelection: z.boolean()
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

const alternateNotFoundSchema = z
	.object({
		error: z.literal("ALTERNATE_NOT_FOUND"),
		message: z.string().min(1),
		timestamp: z.number().int().nonnegative()
	})
	.passthrough();

describe("LLM contract: delete profile", () => {
	let harness: LlmContractTestHarness;
	const now = Date.now();

	const activeProfile = LLMProfileSchema.parse({
		id: "44dbd2de-3116-4d16-90d1-52d0c51b6689",
		name: "Azure Prod",
		providerType: "azure",
		endpointUrl: "https://workspace.openai.azure.com",
		apiKey: "sk-azure",
		modelId: "gpt-4",
		isActive: true,
		consentTimestamp: now,
		createdAt: now - 1000,
		modifiedAt: now - 1000
	});

	const backupProfile = LLMProfileSchema.parse({
		id: "c9746a76-3d67-413f-9ae2-0115a7f489e7",
		name: "Local llama.cpp",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:8080",
		apiKey: "sk-local",
		modelId: null,
		isActive: false,
		consentTimestamp: null,
		createdAt: now - 2000,
		modifiedAt: now - 2000
	});

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
		const vault: ProfileVaultSeed = ProfileVaultSchema.parse({
			profiles: [activeProfile, backupProfile],
			encryptionAvailable: true,
			version: "1.0.0"
		});
		await harness.clearVault();
		await harness.seedVault(vault);
	});

	afterEach(async () => {
		await harness.close();
	});

	it("deletes active profile while activating alternate", async () => {
		const response = await harness.invoke("llm:profiles:delete", {
			id: activeProfile.id,
			activateAlternateId: backupProfile.id
		});

		const parsed = successResponseSchema.parse(response);
		expect(parsed.data.deletedId).toBe(activeProfile.id);
		expect(parsed.data.newActiveProfileId).toBe(backupProfile.id);
		expect(parsed.data.requiresUserSelection).toBe(false);
	});

	it("requires alternate selection when deleting active without replacement", async () => {
		const response = await harness.invoke("llm:profiles:delete", {
			id: activeProfile.id
		});

		const parsed = successResponseSchema.parse(response);
		expect(parsed.data.deletedId).toBe(activeProfile.id);
		expect(parsed.data.newActiveProfileId).toBeNull();
		expect(parsed.data.requiresUserSelection).toBe(true);
	});

	it("returns PROFILE_NOT_FOUND for missing profile", async () => {
		const response = await harness.invoke("llm:profiles:delete", {
			id: "3c7cab79-b37a-44c5-9900-c3ec8c8a8a3d"
		});

		const error = profileNotFoundSchema.parse(response);
		expect(error.message).toMatch(/not found/i);
	});

	it("returns ALTERNATE_NOT_FOUND when alternate is unknown", async () => {
		const response = await harness.invoke("llm:profiles:delete", {
			id: activeProfile.id,
			activateAlternateId: "37f0a748-241c-4b7f-8b2a-6ef672760a58"
		});

		const error = alternateNotFoundSchema.parse(response);
		expect(error.message).toMatch(/alternate/i);
	});
});
