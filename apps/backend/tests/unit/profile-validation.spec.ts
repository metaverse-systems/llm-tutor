import { describe, it, expect } from "vitest";
import type { EncryptionService } from "../../src/infra/encryption/index.js";
import { ProfileService, ProfileValidationError } from "../../src/services/llm/profile.service.js";
import { ProfileVaultService, createInMemoryProfileVaultStore } from "../../src/services/llm/profile-vault.js";

function createProfileService() {
	const store = createInMemoryProfileVaultStore();
	const vaultService = new ProfileVaultService({ store });
	const encryptionService = {
		encrypt: (value: string) => ({ value, wasEncrypted: false }),
		getStatus: () => ({ encryptionAvailable: false, lastFallbackEvent: null })
	} as unknown as EncryptionService;

	return new ProfileService({
		vaultService,
		encryptionService,
		now: () => 1_700_000,
		uuid: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	});
}

const baseLocalPayload = {
	name: "Local llama.cpp",
	providerType: "llama.cpp" as const,
	endpointUrl: "http://localhost:11434",
	apiKey: "sk-local",
	modelId: null,
	consentTimestamp: null
};

const baseAzurePayload = {
	name: "Azure Prod",
	providerType: "azure" as const,
	endpointUrl: "https://workspace.openai.azure.com",
	apiKey: "sk-azure",
	modelId: "gpt-4",
	consentTimestamp: Date.now()
};

async function expectValidationError(operation: () => Promise<unknown>, assertion: (error: ProfileValidationError) => void) {
	try {
		await operation();
		throw new Error("Expected ProfileValidationError to be thrown");
	} catch (error) {
		expect(error).toBeInstanceOf(ProfileValidationError);
		assertion(error as ProfileValidationError);
	}
}

function extractFieldErrors(error: ProfileValidationError): Record<string, string[]> {
	const details = error.details;
	if (details && typeof details === "object" && "fieldErrors" in details) {
		const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
		if (fieldErrors && typeof fieldErrors === "object") {
			return fieldErrors as Record<string, string[]>;
		}
	}
	return {};
}

describe("ProfileService validation", () => {
	it("rejects empty profile names", async () => {
		const service = createProfileService();

		await expectValidationError(
			() => service.createProfile({ ...baseLocalPayload, name: "   " }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.name?.[0]).toMatch(/at least 1 character/i);
			}
		);
	});

	it("rejects invalid UUIDs on update", async () => {
		const service = createProfileService();

		await expectValidationError(
			() => service.updateProfile({ id: "not-a-uuid" }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.id?.[0]).toMatch(/uuid/i);
			}
		);
	});

	it("rejects invalid endpoint URLs", async () => {
		const service = createProfileService();

		await expectValidationError(
			() => service.createProfile({ ...baseLocalPayload, endpointUrl: "nota-url" }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.endpointUrl?.[0]).toMatch(/valid url/i);
			}
		);
	});

	it("requires consent for Azure profiles", async () => {
		const service = createProfileService();

		await expectValidationError(
			() => service.createProfile({ ...baseAzurePayload, consentTimestamp: null }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.consentTimestamp?.[0]).toMatch(/consent/i);
			}
		);
	});

	it("rejects profile names longer than 100 characters", async () => {
		const service = createProfileService();
		const longName = "L".repeat(101);

		await expectValidationError(
			() => service.createProfile({ ...baseLocalPayload, name: longName }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.name?.[0]).toMatch(/at most 100 character/i);
			}
		);
	});

	it("rejects API keys longer than 500 characters", async () => {
		const service = createProfileService();
		const longApiKey = "a".repeat(501);

		await expectValidationError(
			() => service.createProfile({ ...baseLocalPayload, apiKey: longApiKey }),
			(error) => {
				const fieldErrors = extractFieldErrors(error);
				expect(fieldErrors.apiKey?.[0]).toMatch(/at most 500 character/i);
			}
		);
	});
});
