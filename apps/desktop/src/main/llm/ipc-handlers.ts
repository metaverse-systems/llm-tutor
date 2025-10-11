import { ipcMain as electronIpcMain, safeStorage } from "electron";
import type { IpcMain } from "electron";

import {
	AutoDiscoveryService,
	type AutoDiscoveryProfileService,
	type CreateProfilePayload as AutoDiscoveryCreateProfilePayload,
	type CreateProfileResult as AutoDiscoveryCreateProfileResult,
	type DiscoveryResult,
	type ListProfilesResult as AutoDiscoveryListProfilesResult,
	type RedactedProfile as AutoDiscoveryRedactedProfile
} from "./auto-discovery";
import type { TestPromptResult } from "../../../../../packages/shared/src/llm/schemas";
import {
	EncryptionService,
	type EncryptionFallbackEvent,
	type SafeStorageAdapter
} from "../../../../backend/src/infra/encryption/index.js";
import {
	ProfileVaultService,
	ProfileNotFoundError,
	createElectronProfileVaultStore,
	ProfileVaultReadError,
	ProfileVaultWriteError
} from "../../../../backend/src/services/llm/profile-vault.js";
import {
	ProfileService,
	ProfileValidationError,
	AlternateProfileNotFoundError,
	type ActivateProfilePayload,
	type CreateProfilePayload as ServiceCreateProfilePayload,
	type CreateProfileResult as ServiceCreateProfileResult,
	type DeleteProfilePayload,
	type DeleteProfileResult as ServiceDeleteProfileResult,
	type ListProfilesResult as ServiceListProfilesResult,
	type UpdateProfilePayload,
	type UpdateProfileResult as ServiceUpdateProfileResult,
	type ActivateProfileResult as ServiceActivateProfileResult
} from "../../../../backend/src/services/llm/profile.service.js";
import {
	TestPromptService,
	NoActiveProfileError,
	TestPromptTimeoutError,
	type TestPromptRequest
} from "../../../../backend/src/services/llm/test-prompt.service.js";

export const LLM_CHANNELS = Object.freeze({
	list: "llm:profiles:list",
	create: "llm:profiles:create",
	update: "llm:profiles:update",
	delete: "llm:profiles:delete",
	activate: "llm:profiles:activate",
	testPrompt: "llm:profiles:test",
	discover: "llm:profiles:discover"
});

export type LlmChannel = (typeof LLM_CHANNELS)[keyof typeof LLM_CHANNELS];

export interface SuccessResponse<T> {
	success: true;
	data: T;
	timestamp: number;
}

export interface ErrorResponse {
	error: string;
	message: string;
	details?: unknown;
	timestamp: number;
}

export interface LlmIpcRegistration {
	dispose: () => void;
}

export interface RegisterLLMHandlersOptions {
	ipcMain?: IpcMain;
	profileService?: ProfileService;
	testPromptService?: TestPromptService;
	autoDiscoveryService?: AutoDiscoveryService;
	profileVaultService?: ProfileVaultService;
	encryptionService?: EncryptionService;
	logger?: Pick<Console, "info" | "warn" | "error">;
}

export async function registerLLMHandlers(
	options: RegisterLLMHandlersOptions = {}
): Promise<LlmIpcRegistration> {
	const logger = options.logger ?? console;
	const ipc = options.ipcMain ?? electronIpcMain;

	let encryptionService = options.encryptionService;
	let profileVaultService = options.profileVaultService;
	const profileService = options.profileService;
	const testPromptService = options.testPromptService;
	const autoDiscoveryService = options.autoDiscoveryService;

	const needsDefaultProfileService = !profileService;
	const needsDefaultTestPromptService = !testPromptService;

	if (needsDefaultProfileService || needsDefaultTestPromptService) {
		if (!profileVaultService) {
			profileVaultService = new ProfileVaultService({
				store: await createElectronProfileVaultStore()
			});
		}

		if (!encryptionService) {
			encryptionService = new EncryptionService({
				safeStorage: createSafeStorageAdapter(logger),
				onFallback: (event) => logEncryptionFallback(event, logger)
			});
		}
	}

	const resolvedProfileService = profileService ??
		new ProfileService({
			vaultService: profileVaultService!,
			encryptionService: encryptionService!,
			diagnosticsRecorder: null
		});

	const resolvedTestPromptService = testPromptService ??
		new TestPromptService({
			vaultService: profileVaultService!,
			encryptionService: encryptionService!,
			diagnosticsRecorder: null
		});

	const resolvedAutoDiscoveryService = autoDiscoveryService ??
		new AutoDiscoveryService({
			profileService: createAutoDiscoveryProfileServiceAdapter(resolvedProfileService),
			diagnosticsRecorder: null,
			logger
		});

	const registeredChannels: LlmChannel[] = [];

	const register = <Result>(channel: LlmChannel, handler: (payload: unknown) => Promise<Result>) => {
		ipc.removeHandler(channel);
		ipc.handle(channel, async (_event, ...args) => {
			const [payload] = args as [unknown?];
			try {
				const data = await handler(payload);
				return successResponse(data);
			} catch (error) {
				return errorResponse(error, logger);
			}
		});
		registeredChannels.push(channel);
	};

	register<ServiceListProfilesResult>(LLM_CHANNELS.list, () => {
		return resolvedProfileService.listProfiles();
	});

	register<ServiceCreateProfileResult>(LLM_CHANNELS.create, (_payload: unknown) => {
		return resolvedProfileService.createProfile(toCreateProfilePayload(_payload));
	});

	register<ServiceUpdateProfileResult>(LLM_CHANNELS.update, (_payload: unknown) => {
		return resolvedProfileService.updateProfile(toUpdateProfilePayload(_payload));
	});

	register<ServiceDeleteProfileResult>(LLM_CHANNELS.delete, (_payload: unknown) => {
		return resolvedProfileService.deleteProfile(toDeleteProfilePayload(_payload));
	});

	register<ServiceActivateProfileResult>(LLM_CHANNELS.activate, (_payload: unknown) => {
		return resolvedProfileService.activateProfile(toActivateProfilePayload(_payload));
	});

	register<TestPromptResult>(LLM_CHANNELS.testPrompt, async (_payload: unknown): Promise<TestPromptResult> => {
		const request = toTestPromptRequest(_payload);
		const result = (await resolvedTestPromptService.testPrompt(request)) as TestPromptResult;
		return result;
	});

	register<DiscoveryResult>(LLM_CHANNELS.discover, (_payload: unknown) => {
		const force = coerceForce(_payload);
		return resolvedAutoDiscoveryService.discover(force);
	});

	return {
		dispose: () => {
			for (const channel of registeredChannels) {
				ipc.removeHandler(channel);
			}
		}
	};
}

function createSafeStorageAdapter(
	logger: Pick<Console, "warn" | "error">
): SafeStorageAdapter | null {
	try {
		if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function") {
			return null;
		}

		return {
			isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
			encryptString: (plaintext) => safeStorage.encryptString(plaintext),
			decryptString: (buffer) => safeStorage.decryptString(buffer)
		};
	} catch (error) {
		logger.warn?.("Electron safeStorage unavailable; falling back to plaintext storage.", error);
		return null;
	}
}

function logEncryptionFallback(event: EncryptionFallbackEvent, logger: Pick<Console, "warn" | "error">): void {
	const message =
		`Encryption fallback (${event.operation}:${event.reason}) on ${event.platform}: ${event.message}`;
	logger.warn?.(message);
}

function successResponse<T>(data: T): SuccessResponse<T> {
	return {
		success: true,
		data,
		timestamp: Date.now()
	};
}

function errorResponse(error: unknown, logger: Pick<Console, "warn" | "error">): ErrorResponse {
	const timestamp = Date.now();

	if (error instanceof ProfileValidationError) {
		return {
			error: error.code,
			message: error.message,
			details: includeDetails(error.details ?? error),
			timestamp
		};
	}

	if (error instanceof ProfileNotFoundError) {
		return {
			error: error.code,
			message: error.message,
			timestamp
		};
	}

	if (error instanceof AlternateProfileNotFoundError) {
		return {
			error: error.code,
			message: error.message,
			details: includeDetails({ alternateId: error.alternateId }),
			timestamp
		};
	}

	if (error instanceof ProfileVaultReadError || error instanceof ProfileVaultWriteError) {
		return {
			error: error.code,
			message: error.message,
			details: includeDetails(error.cause ?? error),
			timestamp
		};
	}

	if (error instanceof NoActiveProfileError) {
		return {
			error: error.code,
			message: error.message,
			timestamp
		};
	}

	if (error instanceof TestPromptTimeoutError) {
		return {
			error: error.code,
			message: error.message,
			timestamp
		};
	}

	if (error instanceof Error) {
		const candidateCode = (error as Partial<{ code: unknown }>).code;
		if (typeof candidateCode === "string" && candidateCode.trim().length > 0) {
			const code = candidateCode.trim();
			return {
				error: code,
				message: error.message,
				details: includeDetails(error),
				timestamp
			};
		}
	}

	const fallbackMessage = error instanceof Error ? error.message : "Unexpected error";
	if (error instanceof Error) {
		logger.error?.("Unhandled LLM IPC error", error);
	} else {
		logger.error?.("Unhandled LLM IPC error", fallbackMessage);
	}

	return {
		error: "UNEXPECTED_ERROR",
		message: fallbackMessage,
		details: includeDetails(error),
		timestamp
	};
}

function includeDetails(details: unknown): unknown {
	if (!shouldIncludeDebugDetails()) {
		return undefined;
	}

	if (!details) {
		return undefined;
	}

	if (details instanceof Error) {
		return {
			name: details.name,
			message: details.message,
			stack: details.stack
		};
	}

	return details;
}

function shouldIncludeDebugDetails(): boolean {
	const env = process.env.NODE_ENV ?? "development";
	return env !== "production";
}

function coerceForce(payload: unknown): boolean {
	if (!payload || typeof payload !== "object") {
		return false;
	}

	const candidate = payload as { force?: unknown };
	return candidate.force === true;
}

function createAutoDiscoveryProfileServiceAdapter(service: ProfileService): AutoDiscoveryProfileService {
	return {
		async listProfiles(): Promise<AutoDiscoveryListProfilesResult> {
			const result = await service.listProfiles();
			const profiles = result.profiles.map((profile) => ({
				...profile,
				apiKey: String(profile.apiKey)
			})) as AutoDiscoveryRedactedProfile[];
			return {
				profiles,
				encryptionAvailable: result.encryptionAvailable,
				activeProfileId: result.activeProfileId
			};
		},
		async createProfile(
			payload: AutoDiscoveryCreateProfilePayload
		): Promise<AutoDiscoveryCreateProfileResult> {
			const result = await service.createProfile(payload as ServiceCreateProfilePayload);
			const profile = {
				...result.profile,
				apiKey: String(result.profile.apiKey)
			} as AutoDiscoveryRedactedProfile;
			return {
				profile,
				warning: result.warning
			};
		}
	};
}

function toCreateProfilePayload(payload: unknown): ServiceCreateProfilePayload {
	return normalizeObject(payload) as ServiceCreateProfilePayload;
}

function toUpdateProfilePayload(payload: unknown): UpdateProfilePayload {
	return normalizeObject(payload) as UpdateProfilePayload;
}

function toDeleteProfilePayload(payload: unknown): DeleteProfilePayload {
	return normalizeObject(payload) as DeleteProfilePayload;
}

function toActivateProfilePayload(payload: unknown): ActivateProfilePayload {
	return normalizeObject(payload) as ActivateProfilePayload;
}

function toTestPromptRequest(payload: unknown): TestPromptRequest {
	const record = normalizeObject(payload);
	const result: TestPromptRequest = {};
	if (typeof record.profileId === "string") {
		result.profileId = record.profileId;
	}
	if (typeof record.promptText === "string") {
		result.promptText = record.promptText;
	}
	return result;
}

function normalizeObject(input: unknown): Record<string, unknown> {
	if (input && typeof input === "object") {
		return input as Record<string, unknown>;
	}
	return {};
}
