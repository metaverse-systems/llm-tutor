import { describe, expect, it, vi } from "vitest";
import type { EncryptionResult, EncryptionService } from "../../src/infra/encryption/index.js";
import {
	API_KEY_PLACEHOLDER,
	AlternateProfileNotFoundError,
	ProfileService,
	ProfileValidationError,
	type LlmProfileDiagnosticsEvent
} from "../../src/services/llm/profile.service.js";
import {
	DEFAULT_PROFILE_VAULT,
	ProfileNotFoundError,
	ProfileVaultService,
	createInMemoryProfileVaultStore
} from "../../src/services/llm/profile-vault.js";
import type { ProfileVault } from "@metaverse-systems/llm-tutor-shared/llm";

interface ProfileServiceTestContext {
	service: ProfileService;
	vaultService: ProfileVaultService;
	encryptMock: ReturnType<typeof vi.fn>;
	getStatusMock: ReturnType<typeof vi.fn>;
	diagnosticsEvents: LlmProfileDiagnosticsEvent[];
	setEncryptionAvailable(value: boolean): void;
	setEncryptionWarning(value: string | null): void;
	pushUuid(value: string): void;
	seedVault(snapshot: ProfileVault): void;
}

function createProfileServiceTestContext(options?: {
	encryptionAvailable?: boolean;
	encryptionWarning?: string | null;
}): ProfileServiceTestContext {
	const store = createInMemoryProfileVaultStore();
	const vaultService = new ProfileVaultService({ store });
	let encryptionAvailable = options?.encryptionAvailable ?? true;
	let encryptionWarning = options?.encryptionWarning ?? null;

	const encryptMock = vi.fn((value: string): EncryptionResult => {
		if (encryptionAvailable) {
			return { value: `encrypted::${value}`, wasEncrypted: true } satisfies EncryptionResult;
		}

		return {
			value,
			wasEncrypted: false,
			warning: encryptionWarning ?? undefined
		} satisfies EncryptionResult;
	});

	const getStatusMock = vi.fn((): ReturnType<EncryptionService["getStatus"]> => ({
		encryptionAvailable,
		lastFallbackEvent: null
	}));

	const encryptionService = {
		encrypt: encryptMock,
		getStatus: getStatusMock
	} as unknown as EncryptionService;

	const diagnosticsEvents: LlmProfileDiagnosticsEvent[] = [];
	const diagnosticsRecorder = {
		record: vi.fn((event: LlmProfileDiagnosticsEvent) => {
			diagnosticsEvents.push({ ...event });
		})
	};

	const uuidQueue = [
		"11111111-1111-4111-8111-111111111111",
		"22222222-2222-4222-8222-222222222222",
		"33333333-3333-4333-8333-333333333333",
		"44444444-4444-4444-8444-444444444444",
		"55555555-5555-4555-8555-555555555555",
		"66666666-6666-4666-8666-666666666666"
	];

	let nowValue = 17_000;

	const service = new ProfileService({
		vaultService,
		encryptionService,
		diagnosticsRecorder,
		now: () => {
			nowValue += 1;
			return nowValue;
		},
		uuid: () => {
			const next = uuidQueue.shift();
			if (!next) {
				throw new Error("UUID queue exhausted in tests");
			}
			return next;
		}
	});

	return {
		service,
		vaultService,
		encryptMock,
		getStatusMock,
		diagnosticsEvents,
		setEncryptionAvailable(value: boolean) {
			encryptionAvailable = value;
		},
		setEncryptionWarning(value: string | null) {
			encryptionWarning = value;
		},
		pushUuid(value: string) {
			uuidQueue.push(value);
		},
		seedVault(snapshot: ProfileVault) {
			store.set(snapshot);
		}
	};
}

function createAzureProfileInput(overrides: Partial<Parameters<ProfileService["createProfile"]>[0]> = {}) {
	return {
		name: "Azure Prod",
		providerType: "azure" as const,
		endpointUrl: "https://workspace.openai.azure.com",
		apiKey: "sk-azure",
		modelId: "gpt-4",
		consentTimestamp: Date.now(),
		...overrides
	};
}

function createLocalProfileInput(overrides: Partial<Parameters<ProfileService["createProfile"]>[0]> = {}) {
	return {
		name: "Local llama.cpp",
		providerType: "llama.cpp" as const,
		endpointUrl: "http://localhost:11434",
		apiKey: "sk-local",
		modelId: null,
		consentTimestamp: null,
		...overrides
	};
}

describe("ProfileService", () => {
	it("creates the first profile, encrypts the API key, and records diagnostics", async () => {
		const ctx = createProfileServiceTestContext();

		const result = await ctx.service.createProfile(createAzureProfileInput());

		expect(result.profile.apiKey).toBe(API_KEY_PLACEHOLDER);
		expect(result.profile.isActive).toBe(true);
		expect(ctx.encryptMock).toHaveBeenCalledWith("sk-azure");

		const vault = ctx.vaultService.loadVault();
		expect(vault.profiles).toHaveLength(1);
		expect(vault.profiles[0].apiKey).toBe("encrypted::sk-azure");

		expect(ctx.diagnosticsEvents).toEqual([
			expect.objectContaining({
				type: "llm_profile_created",
				profileId: result.profile.id,
				providerType: "azure"
			})
		]);
		expect(result.warning).toBeUndefined();
	});

	it("returns encryption warnings when keychain is unavailable", async () => {
		const ctx = createProfileServiceTestContext({
			encryptionAvailable: false,
			encryptionWarning: "Keychain unavailable"
		});

		const result = await ctx.service.createProfile(createAzureProfileInput());

		expect(ctx.encryptMock).toHaveBeenCalledWith("sk-azure");
		expect(result.warning).toContain("Keychain unavailable");

		const stored = ctx.vaultService.loadVault().profiles[0];
		expect(stored.apiKey).toBe("sk-azure");
	});

	it("warns when creating a profile with a duplicate name", async () => {
		const ctx = createProfileServiceTestContext();
		await ctx.service.createProfile(createLocalProfileInput({ name: "Local Model" }));

		const result = await ctx.service.createProfile(
			createLocalProfileInput({ name: "  local model  ", endpointUrl: "http://localhost:8080", apiKey: "" })
		);

		expect(result.warning).toBe('Profile name "local model" already exists.');
	});

	it("allows empty API keys for local providers by normalizing to a placeholder", async () => {
		const ctx = createProfileServiceTestContext();

		const result = await ctx.service.createProfile(
			createLocalProfileInput({ apiKey: "", endpointUrl: "http://localhost:8080" })
		);

		expect(ctx.encryptMock).toHaveBeenCalledWith("");
		expect(result.profile.apiKey).toBe(API_KEY_PLACEHOLDER);
		expect(ctx.vaultService.loadVault().profiles[0].apiKey).toBe("encrypted::");
	});

	it("rejects remote providers without consent", async () => {
		const ctx = createProfileServiceTestContext();

		await expect(
			ctx.service.createProfile(createAzureProfileInput({ consentTimestamp: null }))
		).rejects.toBeInstanceOf(ProfileValidationError);
	});

	it("applies partial updates, re-encrypts new API keys, and records diagnostics", async () => {
		const ctx = createProfileServiceTestContext();
		const created = await ctx.service.createProfile(createLocalProfileInput());

		ctx.encryptMock.mockClear();

		const updated = await ctx.service.updateProfile({
			id: created.profile.id,
			name: "Renamed",
			endpointUrl: "http://localhost:8081",
			apiKey: "sk-new"
		});

		expect(ctx.encryptMock).toHaveBeenCalledWith("sk-new");
		expect(updated.profile.apiKey).toBe(API_KEY_PLACEHOLDER);

		const saved = ctx.vaultService.loadVault().profiles[0];
		expect(saved.name).toBe("Renamed");
		expect(saved.endpointUrl).toBe("http://localhost:8081");
		expect(saved.apiKey).toBe("encrypted::sk-new");

		const lastEvent = ctx.diagnosticsEvents.at(-1);
		expect(lastEvent).toEqual(
			expect.objectContaining({
				type: "llm_profile_updated",
				profileId: created.profile.id,
				changes: ["name", "endpointUrl", "apiKey"]
			})
		);
	});

	it("merges encryption warnings with duplicate-name warnings during update", async () => {
		const ctx = createProfileServiceTestContext();
		const first = await ctx.service.createProfile(createLocalProfileInput({ name: "Alpha" }));
		const second = await ctx.service.createProfile(
			createLocalProfileInput({ name: "Beta", endpointUrl: "http://localhost:8080" })
		);

		ctx.setEncryptionAvailable(false);
		ctx.setEncryptionWarning("Keychain offline");

		const result = await ctx.service.updateProfile({
			id: second.profile.id,
			name: "Alpha",
			apiKey: "sk-beta"
		});

		expect(result.warning).toContain("Keychain offline");
		expect(result.warning).toContain('Profile name "Alpha" already exists.');

		const saved = ctx.vaultService.loadVault().profiles.find((profile) => profile.id === second.profile.id);
		expect(saved?.apiKey).toBe("sk-beta");
	});

	it("does not record an update event when no tracked fields change", async () => {
		const ctx = createProfileServiceTestContext();
		const created = await ctx.service.createProfile(createLocalProfileInput());
		const eventsBefore = ctx.diagnosticsEvents.length;

		const result = await ctx.service.updateProfile({ id: created.profile.id });

		expect(result.warning).toBeUndefined();
		expect(ctx.diagnosticsEvents.length).toBe(eventsBefore);
	});

	it("throws when updating a non-existent profile", async () => {
		const ctx = createProfileServiceTestContext();

		await expect(
			ctx.service.updateProfile({ id: "99999999-9999-4999-8999-999999999999", name: "Ghost" })
		).rejects.toBeInstanceOf(ProfileNotFoundError);
	});

	it("deletes an active profile while activating the provided alternate", async () => {
		const ctx = createProfileServiceTestContext();
		const active = await ctx.service.createProfile(createAzureProfileInput());
		const alternate = await ctx.service.createProfile(
			createLocalProfileInput({ name: "Backup", endpointUrl: "http://localhost:8080" })
		);

		const result = await ctx.service.deleteProfile({
			id: active.profile.id,
			activateAlternateId: alternate.profile.id
		});

		expect(result.deletedId).toBe(active.profile.id);
		expect(result.newActiveProfileId).toBe(alternate.profile.id);
		expect(result.requiresUserSelection).toBe(false);

		const vault = ctx.vaultService.loadVault();
		expect(vault.profiles).toHaveLength(1);
		expect(vault.profiles[0].id).toBe(alternate.profile.id);
		expect(vault.profiles[0].isActive).toBe(true);

		const lastEvent = ctx.diagnosticsEvents.at(-1);
		expect(lastEvent).toEqual(
			expect.objectContaining({ type: "llm_profile_deleted", profileId: active.profile.id })
		);
	});

	it("flags deletions that require the user to choose a new active profile", async () => {
		const ctx = createProfileServiceTestContext();
		const active = await ctx.service.createProfile(createAzureProfileInput());
		await ctx.service.createProfile(createLocalProfileInput({ name: "Backup" }));

		const result = await ctx.service.deleteProfile({ id: active.profile.id });

		expect(result.requiresUserSelection).toBe(true);
		expect(result.newActiveProfileId).toBeNull();
		expect(ctx.vaultService.loadVault().profiles.every((profile) => profile.isActive === false)).toBe(true);
	});

	it("throws when deleting with an unknown alternate id", async () => {
		const ctx = createProfileServiceTestContext();
		const active = await ctx.service.createProfile(createAzureProfileInput());

		await expect(
			ctx.service.deleteProfile({
				id: active.profile.id,
				activateAlternateId: "77777777-7777-4777-8777-777777777777"
			})
		).rejects.toBeInstanceOf(AlternateProfileNotFoundError);
	});

	it("throws when deleting a non-existent profile", async () => {
		const ctx = createProfileServiceTestContext();

		await expect(
			ctx.service.deleteProfile({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })
		).rejects.toBeInstanceOf(ProfileNotFoundError);
	});

	it("activates the requested profile and deactivates the previous active profile", async () => {
		const ctx = createProfileServiceTestContext();
		const first = await ctx.service.createProfile(createAzureProfileInput());
		const second = await ctx.service.createProfile(createLocalProfileInput({ name: "Secondary" }));

		const result = await ctx.service.activateProfile({ id: second.profile.id });

		expect(result.activeProfile.id).toBe(second.profile.id);
		expect(result.activeProfile.apiKey).toBe(API_KEY_PLACEHOLDER);
		expect(result.deactivatedProfileId).toBe(first.profile.id);

		const vault = ctx.vaultService.loadVault();
		expect(vault.profiles.find((profile) => profile.isActive)?.id).toBe(second.profile.id);

		const lastEvent = ctx.diagnosticsEvents.at(-1);
		expect(lastEvent).toEqual(
			expect.objectContaining({ type: "llm_profile_activated", profileId: second.profile.id })
		);
	});

	it("throws when activating a non-existent profile", async () => {
		const ctx = createProfileServiceTestContext();

		await expect(
			ctx.service.activateProfile({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" })
		).rejects.toBeInstanceOf(ProfileNotFoundError);
	});

	it("lists profiles with redacted API keys, sorted with the active profile first", async () => {
		const ctx = createProfileServiceTestContext({ encryptionAvailable: false });
		const beta = await ctx.service.createProfile(createLocalProfileInput({ name: "Beta" }));
		await ctx.service.createProfile(createLocalProfileInput({ name: "Alpha", endpointUrl: "http://localhost:8080" }));
		await ctx.service.createProfile(createLocalProfileInput({ name: "Charlie", endpointUrl: "http://localhost:8081" }));

		ctx.setEncryptionAvailable(true);

		const result = await ctx.service.listProfiles();

		expect(result.encryptionAvailable).toBe(true);
		expect(result.activeProfileId).toBe(beta.profile.id);
		expect(result.profiles.map((profile) => profile.apiKey)).toEqual([
			API_KEY_PLACEHOLDER,
			API_KEY_PLACEHOLDER,
			API_KEY_PLACEHOLDER
		]);
		expect(result.profiles.map((profile) => profile.name)).toEqual(["Beta", "Alpha", "Charlie"]);
		expect(ctx.vaultService.loadVault().encryptionAvailable).toBe(true);
	});

	it("fails validation when switching a local profile to a remote provider without consent", async () => {
		const ctx = createProfileServiceTestContext();
		const created = await ctx.service.createProfile(createLocalProfileInput());

		await expect(
			ctx.service.updateProfile({
				id: created.profile.id,
				providerType: "azure",
				endpointUrl: "https://workspace.openai.azure.com",
				modelId: "gpt-4",
				consentTimestamp: null
			})
		).rejects.toBeInstanceOf(ProfileValidationError);
	});

	it("accepts vault seeds for list operations", async () => {
		const ctx = createProfileServiceTestContext({ encryptionAvailable: false });
		ctx.seedVault({
			...DEFAULT_PROFILE_VAULT,
			profiles: [],
			encryptionAvailable: false
		});

		const result = await ctx.service.listProfiles();

		expect(result.profiles).toHaveLength(0);
		expect(result.encryptionAvailable).toBe(false);
	});
});
