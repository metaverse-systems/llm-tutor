import type { IpcMain } from "electron";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { TestPromptResult } from "../../../../packages/shared/src/llm/schemas";
import { ProfileNotFoundError } from "../../../backend/src/services/llm/profile-vault.js";
import {
	ProfileValidationError,
	AlternateProfileNotFoundError,
	type CreateProfileResult as ServiceCreateProfileResult,
	type UpdateProfileResult as ServiceUpdateProfileResult,
	type DeleteProfileResult as ServiceDeleteProfileResult,
	type ActivateProfileResult as ServiceActivateProfileResult,
	type ListProfilesResult as ServiceListProfilesResult
} from "../../../backend/src/services/llm/profile.service.js";
import { TestPromptTimeoutError } from "../../../backend/src/services/llm/test-prompt.service.js";
import type { DiscoveryResult } from "../../src/main/llm/auto-discovery";
import {
	registerLLMHandlers,
	LLM_CHANNELS,
	type SuccessResponse,
	type ErrorResponse
} from "../../src/main/llm/ipc-handlers";

interface ProfileServiceLike {
	listProfiles: (payload?: unknown) => Promise<ServiceListProfilesResult>;
	createProfile: (payload: unknown) => Promise<ServiceCreateProfileResult>;
	updateProfile: (payload: unknown) => Promise<ServiceUpdateProfileResult>;
	deleteProfile: (payload: unknown) => Promise<ServiceDeleteProfileResult>;
	activateProfile: (payload: unknown) => Promise<ServiceActivateProfileResult>;
}

interface TestPromptServiceLike {
	testPrompt: (payload: unknown) => Promise<TestPromptResult>;
}

interface AutoDiscoveryServiceLike {
	discover: (force?: boolean) => Promise<DiscoveryResult>;
}

class MockIpcMain {
	private readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

	handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void {
		this.handlers.set(channel, listener);
	}

	removeHandler(channel: string): void {
		this.handlers.delete(channel);
	}

	invoke(channel: string, payload?: unknown): Promise<unknown> {
		const handler = this.handlers.get(channel);
		if (!handler) {
			throw new Error(`No handler registered for ${channel}`);
		}
		return Promise.resolve(handler({}, payload));
	}

	hasHandler(channel: string): boolean {
		return this.handlers.has(channel);
	}
}

describe("registerLLMHandlers", () => {
	let ipc: MockIpcMain;
	let profileService: ProfileServiceLike;
	let testPromptService: TestPromptServiceLike;
	let autoDiscoveryService: AutoDiscoveryServiceLike;
	let profileServiceSpies: Record<keyof ProfileServiceLike, ReturnType<typeof vi.fn>>;
	let testPromptServiceSpy: ReturnType<typeof vi.fn>;
	let autoDiscoveryServiceSpy: ReturnType<typeof vi.fn>;
	let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
	let registration: Awaited<ReturnType<typeof registerLLMHandlers>> | null;

	const profile = Object.freeze({
		id: "a1111111-2222-3333-4444-555555555555",
		name: "Test Profile",
		providerType: "llama.cpp" as const,
		endpointUrl: "http://localhost:8080",
		apiKey: "***REDACTED***" as const,
		modelId: null,
		isActive: true,
		consentTimestamp: null,
		createdAt: 1,
		modifiedAt: 1
	});

	const listResult: ServiceListProfilesResult = {
		profiles: [profile],
		encryptionAvailable: true,
		activeProfileId: profile.id
	};

	const createResult: ServiceCreateProfileResult = {
		profile,
		warning: undefined
	};

	const updateResult: ServiceUpdateProfileResult = {
		profile,
		warning: undefined
	};

	const deleteResult: ServiceDeleteProfileResult = {
		deletedId: profile.id,
		newActiveProfileId: null,
		requiresUserSelection: false
	};

	const activateResult: ServiceActivateProfileResult = {
		activeProfile: profile,
		deactivatedProfileId: null
	};

	const testPromptSuccess: TestPromptResult = {
		profileId: profile.id,
		profileName: profile.name,
		providerType: profile.providerType,
		success: true,
		promptText: "Ping",
		responseText: "Pong",
		modelName: "llama-7b",
		latencyMs: 120,
		totalTimeMs: 150,
		errorCode: null,
		errorMessage: null,
		timestamp: Date.now()
	};

	const discoveryResult: DiscoveryResult = {
		discovered: true,
		discoveredUrl: "http://localhost:8080",
		profileCreated: false,
		profileId: profile.id,
		probedPorts: [8080, 8000, 11434]
	};

	beforeEach(() => {
		ipc = new MockIpcMain();

		const listProfiles = vi.fn(() => Promise.resolve(listResult));
		const createProfile = vi.fn(() => Promise.resolve(createResult));
		const updateProfile = vi.fn(() => Promise.resolve(updateResult));
		const deleteProfile = vi.fn(() => Promise.resolve(deleteResult));
		const activateProfile = vi.fn(() => Promise.resolve(activateResult));

		profileServiceSpies = {
			listProfiles,
			createProfile,
			updateProfile,
			deleteProfile,
			activateProfile
		} as Record<keyof ProfileServiceLike, ReturnType<typeof vi.fn>>;
		profileService = {
			listProfiles: listProfiles as unknown as ProfileServiceLike["listProfiles"],
			createProfile: createProfile as unknown as ProfileServiceLike["createProfile"],
			updateProfile: updateProfile as unknown as ProfileServiceLike["updateProfile"],
			deleteProfile: deleteProfile as unknown as ProfileServiceLike["deleteProfile"],
			activateProfile: activateProfile as unknown as ProfileServiceLike["activateProfile"]
		};

		testPromptServiceSpy = vi.fn(() => Promise.resolve(testPromptSuccess));
		testPromptService = {
			testPrompt: testPromptServiceSpy as unknown as TestPromptServiceLike["testPrompt"]
		};

		autoDiscoveryServiceSpy = vi.fn(() => Promise.resolve(discoveryResult));
		autoDiscoveryService = {
			discover: autoDiscoveryServiceSpy as unknown as AutoDiscoveryServiceLike["discover"]
		};

		logger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		};

		registration = null;
	});

	afterEach(() => {
		if (registration) {
			registration.dispose();
		}
		vi.restoreAllMocks();
	});

	async function registerWithMocks(overrides: {
		profileService?: Partial<ProfileServiceLike>;
		testPromptService?: Partial<TestPromptServiceLike>;
		autoDiscoveryService?: Partial<AutoDiscoveryServiceLike>;
	} = {}): Promise<void> {
		const resolvedProfileService = Object.assign({}, profileService, overrides.profileService) as ProfileServiceLike;
		const resolvedTestPromptService = Object.assign({}, testPromptService, overrides.testPromptService) as TestPromptServiceLike;
		const resolvedAutoDiscoveryService = Object.assign({}, autoDiscoveryService, overrides.autoDiscoveryService) as AutoDiscoveryServiceLike;

		registration = await registerLLMHandlers({
			ipcMain: ipc as unknown as IpcMain,
			profileService: resolvedProfileService as never,
			testPromptService: resolvedTestPromptService as never,
			autoDiscoveryService: resolvedAutoDiscoveryService as never,
			logger
		});
	}

	it("returns success responses for happy-path handlers", async () => {
		await registerWithMocks();

		const list = (await ipc.invoke(LLM_CHANNELS.list)) as SuccessResponse<ServiceListProfilesResult>;
		expect(list.success).toBe(true);
		expect(list.data).toEqual(listResult);

		const create = (await ipc.invoke(LLM_CHANNELS.create, { name: "demo" })) as SuccessResponse<ServiceCreateProfileResult>;
		expect(create.success).toBe(true);
		expect(create.data).toEqual(createResult);

		const testPrompt = (await ipc.invoke(LLM_CHANNELS.testPrompt, { profileId: profile.id })) as SuccessResponse<TestPromptResult>;
		expect(testPrompt.success).toBe(true);
		expect(testPrompt.data).toEqual(testPromptSuccess);

		const discovery = (await ipc.invoke(LLM_CHANNELS.discover)) as SuccessResponse<DiscoveryResult>;
		expect(discovery.success).toBe(true);
		expect(discovery.data).toEqual(discoveryResult);
	});

	it("propagates ProfileValidationError details for create", async () => {
		const validationError = new ProfileValidationError("Name is required", {
			details: { field: "name" }
		});
		profileServiceSpies.createProfile.mockRejectedValueOnce(validationError);

		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.create, {})) as ErrorResponse;
		expect(response.error).toBe("VALIDATION_ERROR");
		expect(response.message).toContain("Name");
		expect(response.details).toEqual(validationError.details);
	});

	it("surfaces ProfileNotFoundError for update requests", async () => {
		profileServiceSpies.updateProfile.mockRejectedValueOnce(new ProfileNotFoundError("missing-id"));
		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.update, { id: "missing-id" })) as ErrorResponse;
		expect(response.error).toBe("PROFILE_NOT_FOUND");
		expect(response.message).toContain("missing-id");
	});

	it("maps alternate profile errors for delete requests", async () => {
		profileServiceSpies.deleteProfile.mockRejectedValueOnce(new AlternateProfileNotFoundError("alt-id"));
		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.delete, { id: profile.id, activateAlternateId: "alt-id" })) as ErrorResponse;
		expect(response.error).toBe("ALTERNATE_NOT_FOUND");
		expect(response.details).toEqual({ alternateId: "alt-id" });
	});

	it("maps timeout errors for test prompt requests", async () => {
		testPromptServiceSpy.mockRejectedValueOnce(new TestPromptTimeoutError(5000));
		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.testPrompt, {})) as ErrorResponse;
		expect(response.error).toBe("TIMEOUT");
		expect(response.message).toContain("5000");
	});

	it("passes force flag to auto-discovery service", async () => {
		await registerWithMocks();

		await ipc.invoke(LLM_CHANNELS.discover, { force: true });
		expect(autoDiscoveryServiceSpy).toHaveBeenCalledWith(true);
	});

	it("returns normalized error response for unexpected errors with codes", async () => {
		const unexpected = new Error("boom") as Error & { code: string };
		unexpected.code = "SOMETHING_BAD";
		profileServiceSpies.listProfiles.mockRejectedValueOnce(unexpected);
		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.list)) as ErrorResponse;
		expect(response.error).toBe("SOMETHING_BAD");
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("logs unexpected errors without codes", async () => {
		profileServiceSpies.listProfiles.mockRejectedValueOnce(new Error("mystery"));
		await registerWithMocks();

		const response = (await ipc.invoke(LLM_CHANNELS.list)) as ErrorResponse;
		expect(response.error).toBe("UNEXPECTED_ERROR");
		expect(response.message).toBe("mystery");
		expect(logger.error).toHaveBeenCalledWith("Unhandled LLM IPC error", expect.any(Error));
	});

	it("removes all handlers on dispose", async () => {
		await registerWithMocks();
		expect(ipc.hasHandler(LLM_CHANNELS.list)).toBe(true);

		registration?.dispose();
		expect(ipc.hasHandler(LLM_CHANNELS.list)).toBe(false);
		expect(ipc.hasHandler(LLM_CHANNELS.create)).toBe(false);
	});
});
