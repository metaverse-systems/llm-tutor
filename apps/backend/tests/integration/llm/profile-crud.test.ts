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
} from "../../contract/llm/helpers.js";

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

describe("LLM integration: profile CRUD workflow", () => {
	let harness: LlmContractTestHarness;

	beforeEach(async () => {
		harness = await loadLlmContractTestHarness();
		await harness.clearVault();
	});

	afterEach(async () => {
		await harness.close();
	});

	async function listVault() {
		const response = await harness.invoke("llm:profiles:list");
		return listResponseSchema.parse(response);
	}

	async function expectDiagnosticsEvent(type: string) {
		if (!harness.readDiagnosticsEvents) {
			throw new Error("LLM contract test harness must expose readDiagnosticsEvents()");
		}

		const events = await harness.readDiagnosticsEvents({ type });
		expect(Array.isArray(events)).toBe(true);
		expect(events.length).toBeGreaterThan(0);
		diagnosticsEventSchema.parse(events.at(-1));
	}

	it("supports creating, updating, activating, and deleting profiles", async () => {
		const localCreate = await harness.invoke("llm:profiles:create", {
			name: "Local llama.cpp",
			providerType: "llama.cpp",
			endpointUrl: "http://localhost:8080",
			apiKey: "",
			modelId: null,
			consentTimestamp: null
		});
		const localProfile = createResponseSchema.parse(localCreate).data.profile;
		expect(localProfile.isActive).toBe(true);

		await expectDiagnosticsEvent("llm_profile_created");

		const azureCreate = await harness.invoke("llm:profiles:create", {
			name: "Azure OpenAI Prod",
			providerType: "azure",
			endpointUrl: "https://workspace.openai.azure.com",
			apiKey: "sk-azure",
			modelId: "gpt-4",
			consentTimestamp: Date.now()
		});
		const azureProfile = createResponseSchema.parse(azureCreate).data.profile;
		expect(azureProfile.providerType).toBe("azure");

		const afterCreate = await listVault();
		expect(afterCreate.data.profiles).toHaveLength(2);
		const activeCount = afterCreate.data.profiles.filter((profile) => profile.isActive).length;
		expect(activeCount).toBe(1);

		const updateResponse = await harness.invoke("llm:profiles:update", {
			id: azureProfile.id,
			name: "Azure Sandbox",
			modelId: "gpt-4.1"
		});
		const updatedProfile = updateResponseSchema.parse(updateResponse).data.profile;
		expect(updatedProfile.name).toBe("Azure Sandbox");
		expect(updatedProfile.modelId).toBe("gpt-4.1");

		await expectDiagnosticsEvent("llm_profile_updated");

		const activateResponse = await harness.invoke("llm:profiles:activate", {
			id: azureProfile.id
		});
		const activation = activateResponseSchema.parse(activateResponse).data;
		expect(activation.activeProfile.id).toBe(azureProfile.id);
		expect(activation.deactivatedProfileId).toBe(localProfile.id);

		await expectDiagnosticsEvent("llm_profile_activated");

		const afterActivate = await listVault();
		const afterActivateVault = ProfileVaultSchema.parse({
			profiles: afterActivate.data.profiles,
			encryptionAvailable: afterActivate.data.encryptionAvailable,
			version: "1.0.0"
		}) as ProfileVaultSeed;
		const activeIds = afterActivateVault.profiles.filter((profile) => profile.isActive).map((profile) => profile.id);
		expect(activeIds).toEqual([azureProfile.id]);

		const deleteResponse = await harness.invoke("llm:profiles:delete", {
			id: azureProfile.id,
			activateAlternateId: localProfile.id
		});
		const deletion = deleteResponseSchema.parse(deleteResponse).data;
		expect(deletion.deletedId).toBe(azureProfile.id);
		expect(deletion.newActiveProfileId).toBe(localProfile.id);
		expect(deletion.requiresUserSelection).toBe(false);

		await expectDiagnosticsEvent("llm_profile_deleted");

		const finalState = await listVault();
		expect(finalState.data.profiles).toHaveLength(1);
		expect(finalState.data.activeProfileId).toBe(localProfile.id);
	});

	it("requires alternate selection when deleting the active profile without replacement", async () => {
		await harness.clearVault();

		const createOne = await harness.invoke("llm:profiles:create", {
			name: "Local llama.cpp",
			providerType: "llama.cpp",
			endpointUrl: "http://localhost:8080",
			apiKey: "",
			modelId: null,
			consentTimestamp: null
		});
		const primaryProfile = createResponseSchema.parse(createOne).data.profile;

		const createTwo = await harness.invoke("llm:profiles:create", {
			name: "Azure",
			providerType: "azure",
			endpointUrl: "https://workspace.openai.azure.com",
			apiKey: "sk-azure",
			modelId: "gpt-4",
			consentTimestamp: Date.now()
		});
		const secondaryProfile = createResponseSchema.parse(createTwo).data.profile;

		await harness.invoke("llm:profiles:activate", { id: secondaryProfile.id });

		const deletion = await harness.invoke("llm:profiles:delete", {
			id: secondaryProfile.id
		});
		const deleteResult = deleteResponseSchema.parse(deletion).data;

		expect(deleteResult.deletedId).toBe(secondaryProfile.id);
		expect(deleteResult.newActiveProfileId).toBeNull();
		expect(deleteResult.requiresUserSelection).toBe(true);

		const vaultState = await listVault();
		const activeProfiles = vaultState.data.profiles.filter((profile) => profile.isActive);
		expect(activeProfiles).toHaveLength(0);
		expect(vaultState.data.profiles.map((profile) => profile.id)).toContain(primaryProfile.id);
	});
});
