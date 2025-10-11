import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_PROFILE_VAULT,
	ProfileNotFoundError,
	ProfileVaultService,
	ProfileVaultWriteError,
	createInMemoryProfileVaultStore
} from "../../src/services/llm/profile-vault.js";
import type { LLMProfile } from "@metaverse-systems/llm-tutor-shared";

let counter = 0;

function createProfile(overrides: Partial<LLMProfile> = {}): LLMProfile {
	const now = Date.now() + counter;
	const base: LLMProfile = {
		id: overrides.id ?? `00000000-0000-0000-0000-${(counter++).toString().padStart(12, "0")}`,
		name: "Test Profile",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:8080",
		apiKey: "api-key",
		modelId: null,
		isActive: false,
		consentTimestamp: null,
		createdAt: overrides.createdAt ?? now,
		modifiedAt: overrides.modifiedAt ?? now
	};

	return { ...base, ...overrides } satisfies LLMProfile;
}

describe("ProfileVaultService", () => {
	beforeEach(() => {
		counter = 0;
	});
	it("returns default vault when store empty", () => {
		const store = createInMemoryProfileVaultStore();
		const service = new ProfileVaultService({ store });

		const vault = service.loadVault();

		expect(vault).toEqual(DEFAULT_PROFILE_VAULT);
	});

	it("persists newly added profiles", () => {
		const store = createInMemoryProfileVaultStore();
		const service = new ProfileVaultService({ store });
		const profile = createProfile({ name: "Azure" });

		const savedVault = service.addProfile(profile);
		const reloaded = service.loadVault();

		expect(savedVault.profiles).toHaveLength(1);
		expect(savedVault.profiles[0]).toMatchObject({ name: "Azure" });
		expect(reloaded.profiles[0].id).toBe(profile.id);
	});

	it("enforces single active profile on add", () => {
		const active = createProfile({ id: "11111111-1111-4111-8111-111111111111", isActive: true });
		const store = createInMemoryProfileVaultStore({
			...DEFAULT_PROFILE_VAULT,
			profiles: [active]
		});
		const service = new ProfileVaultService({ store });
		const next = createProfile({
			id: "22222222-2222-4222-8222-222222222222",
			isActive: true,
			modifiedAt: active.modifiedAt + 100
		});

		const updated = service.addProfile(next);

		expect(updated.profiles.filter((profile) => profile.isActive)).toHaveLength(1);
		expect(updated.profiles.find((profile) => profile.isActive)?.id).toBe(next.id);
	});

	it("updates existing profile fields", () => {
		const original = createProfile({ name: "Primary" });
		const store = createInMemoryProfileVaultStore({
			...DEFAULT_PROFILE_VAULT,
			profiles: [original]
		});
		const service = new ProfileVaultService({ store });

		const updated = service.updateProfile(original.id, {
			name: "Renamed",
			endpointUrl: "http://localhost:11434",
			modifiedAt: original.modifiedAt + 10
		});

		expect(updated.name).toBe("Renamed");
		expect(updated.endpointUrl).toBe("http://localhost:11434");
		expect(updated.modifiedAt).toBe(original.modifiedAt + 10);
	});

	it("rejects attempts to change profile id", () => {
		const original = createProfile();
		const store = createInMemoryProfileVaultStore({
			...DEFAULT_PROFILE_VAULT,
			profiles: [original]
		});
		const service = new ProfileVaultService({ store });

		expect(() => service.updateProfile(original.id, { id: "33333333-3333-4333-8333-333333333333" })).toThrow(
			ProfileVaultWriteError
		);
	});

	it("throws when updating non-existent profile", () => {
		const service = new ProfileVaultService({ store: createInMemoryProfileVaultStore() });

		expect(() => service.updateProfile("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { name: "Missing" })).toThrow(
			ProfileNotFoundError
		);
	});

	it("deletes profiles by id", () => {
		const first = createProfile();
		const second = createProfile();
		const store = createInMemoryProfileVaultStore({
			...DEFAULT_PROFILE_VAULT,
			profiles: [first, second]
		});
		const service = new ProfileVaultService({ store });

		service.deleteProfile(first.id);

		const vault = service.loadVault();
		expect(vault.profiles).toHaveLength(1);
		expect(vault.profiles[0].id).toBe(second.id);
	});

	it("throws when deleting missing profile", () => {
		const service = new ProfileVaultService({ store: createInMemoryProfileVaultStore() });

		expect(() => service.deleteProfile("ffffffff-ffff-4fff-8fff-ffffffffffff")).toThrow(ProfileNotFoundError);
	});

	it("sets encryption availability without duplicating writes", () => {
		const store = createInMemoryProfileVaultStore();
		const service = new ProfileVaultService({ store });

		service.setEncryptionAvailable(true);
		expect(service.loadVault().encryptionAvailable).toBe(true);

		service.setEncryptionAvailable(true);
		expect(service.loadVault().encryptionAvailable).toBe(true);
	});

	it("normalizes vault with multiple active profiles", () => {
		const first = createProfile({
			id: "aaaaaaa0-0000-4000-8000-000000000001",
			isActive: true,
			createdAt: 5,
			modifiedAt: 10
		});
		const second = createProfile({
			id: "bbbbbbb0-0000-4000-8000-000000000002",
			isActive: true,
			createdAt: 15,
			modifiedAt: 20
		});
		const store = createInMemoryProfileVaultStore({
			profiles: [first, second],
			encryptionAvailable: false,
			version: "1.0.0"
		});
		const service = new ProfileVaultService({ store });

		const vault = service.loadVault();

		expect(vault.profiles.filter((profile) => profile.isActive)).toHaveLength(1);
		expect(vault.profiles.find((profile) => profile.isActive)?.id).toBe(second.id);
	});

	it("deduplicates profiles by id, keeping the last occurrence", () => {
		const stale = createProfile({
			id: "bbbbbbb0-0000-4000-8000-000000000002",
			name: "Stale",
			createdAt: 5,
			modifiedAt: 10
		});
		const latest = createProfile({
			id: stale.id,
			name: "Latest",
			createdAt: 15,
			modifiedAt: 20
		});

		const store = createInMemoryProfileVaultStore({
			profiles: [stale, latest],
			encryptionAvailable: false,
			version: "1.0.0"
		});
		const service = new ProfileVaultService({ store });

		const vault = service.loadVault();

		expect(vault.profiles).toHaveLength(1);
		expect(vault.profiles[0].name).toBe("Latest");
	});

	it("rejects invalid profile payloads on save", () => {
		const store = createInMemoryProfileVaultStore();
		const service = new ProfileVaultService({ store });
		const invalid: LLMProfile = {
			...createProfile(),
			name: "",
			modifiedAt: -1
		};

		expect(() => service.saveVault({ ...DEFAULT_PROFILE_VAULT, profiles: [invalid] })).toThrow(
			ProfileVaultWriteError
		);
	});
});
