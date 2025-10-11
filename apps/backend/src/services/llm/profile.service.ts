import {
	LLMProfileSchema,
	type LLMProfile,
	type ProfileVault,
	type ProviderType
} from "@metaverse-systems/llm-tutor-shared/llm";
import { randomUUID } from "node:crypto";
import { ZodError, z } from "zod";

import {
	ProfileNotFoundError,
	ProfileVaultWriteError
} from "./profile-vault.js";
import type { ProfileVaultService } from "./profile-vault.js";
import type {
	EncryptionResult,
	EncryptionService
} from "../../infra/encryption/index.js";

export const API_KEY_PLACEHOLDER = "***REDACTED***" as const;

const providerTypeSchema = z.enum(["llama.cpp", "azure", "custom"]);
const REMOTE_PROVIDERS = new Set<ProviderType>(["azure", "custom"]);
const SORT_LOCALE = "en" as const;
const SORT_OPTIONS: Intl.CollatorOptions = { sensitivity: "base" };
const TRACKED_UPDATE_FIELDS = [
	"name",
	"providerType",
	"endpointUrl",
	"apiKey",
	"modelId",
	"isActive",
	"consentTimestamp"
] as const satisfies readonly (keyof LLMProfile)[];

const createProfilePayloadSchema = z
	.object({
		name: z.string().min(1).max(100),
		providerType: providerTypeSchema,
		endpointUrl: z.string().min(1),
		apiKey: z.string().max(500),
		modelId: z.union([z.string().max(200), z.null()]),
		consentTimestamp: z.number().int().nonnegative().nullable()
	})
	.strict()
	.superRefine((value, ctx) => {
		if (REMOTE_PROVIDERS.has(value.providerType) && value.consentTimestamp === null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "consentTimestamp is required for remote providers",
				path: ["consentTimestamp"]
			});
		}

		if (REMOTE_PROVIDERS.has(value.providerType) && value.apiKey.trim().length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "apiKey is required for remote providers",
				path: ["apiKey"]
			});
		}
	});

const updateProfilePayloadSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string().min(1).max(100).optional(),
		providerType: providerTypeSchema.optional(),
		endpointUrl: z.string().min(1).optional(),
		apiKey: z.string().max(500).optional(),
		modelId: z.union([z.string().max(200), z.null()]).optional(),
		consentTimestamp: z.number().int().nonnegative().nullable().optional()
	})
	.strict();

const deleteProfilePayloadSchema = z
	.object({
		id: z.string().uuid(),
		activateAlternateId: z.string().uuid().optional()
	})
	.strict();

const activateProfilePayloadSchema = z
	.object({
		id: z.string().uuid()
	})
	.strict();

export type CreateProfilePayload = z.infer<typeof createProfilePayloadSchema>;
export type UpdateProfilePayload = z.infer<typeof updateProfilePayloadSchema>;
export type DeleteProfilePayload = z.infer<typeof deleteProfilePayloadSchema>;
export type ActivateProfilePayload = z.infer<typeof activateProfilePayloadSchema>;

export type LlmProfileDiagnosticsEvent =
	| {
			type: "llm_profile_created";
			profileId: string;
			profileName: string;
			providerType: ProviderType;
			timestamp: number;
	  }
	| {
			type: "llm_profile_updated";
			profileId: string;
			profileName: string;
			providerType: ProviderType;
			changes: string[];
			timestamp: number;
	  }
	| {
			type: "llm_profile_deleted";
			profileId: string;
			profileName: string;
			providerType: ProviderType;
			timestamp: number;
	  }
	| {
			type: "llm_profile_activated";
			profileId: string;
			profileName: string;
			providerType: ProviderType;
			timestamp: number;
	  };

export interface DiagnosticsEventRecorder {
	record(event: LlmProfileDiagnosticsEvent): void | Promise<void>;
}

export class ProfileValidationError extends Error {
	readonly code = "VALIDATION_ERROR" as const;
	readonly details?: unknown;

	constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
		super(message, options);
		this.name = "ProfileValidationError";
		this.details = options?.details;
	}
}

export class AlternateProfileNotFoundError extends Error {
	readonly code = "ALTERNATE_NOT_FOUND" as const;
	readonly alternateId: string;

	constructor(alternateId: string) {
		super(`Alternate profile with id ${alternateId} not found`);
		this.name = "AlternateProfileNotFoundError";
		this.alternateId = alternateId;
	}
}

interface RedactedProfile extends Omit<LLMProfile, "apiKey"> {
	apiKey: typeof API_KEY_PLACEHOLDER;
}

export interface CreateProfileResult {
	profile: RedactedProfile;
	warning?: string;
}

export interface UpdateProfileResult {
	profile: RedactedProfile;
	warning?: string;
}

export interface DeleteProfileResult {
	deletedId: string;
	newActiveProfileId: string | null;
	requiresUserSelection: boolean;
}

export interface ActivateProfileResult {
	activeProfile: RedactedProfile;
	deactivatedProfileId: string | null;
}

export interface ListProfilesResult {
	profiles: RedactedProfile[];
	encryptionAvailable: boolean;
	activeProfileId: string | null;
}

export interface ProfileServiceOptions {
	vaultService: ProfileVaultService;
	encryptionService: EncryptionService;
	diagnosticsRecorder?: DiagnosticsEventRecorder | null;
	now?: () => number;
	uuid?: () => string;
}

export class ProfileService {
	private readonly vaultService: ProfileVaultService;
	private readonly encryptionService: EncryptionService;
	private readonly diagnosticsRecorder?: DiagnosticsEventRecorder | null;
	private readonly now: () => number;
	private readonly uuid: () => string;

	constructor(options: ProfileServiceOptions) {
		this.vaultService = options.vaultService;
		this.encryptionService = options.encryptionService;
		this.diagnosticsRecorder = options.diagnosticsRecorder ?? null;
		this.now = options.now ?? (() => Date.now());
		this.uuid = options.uuid ?? (() => randomUUID());
	}

	async listProfiles(): Promise<ListProfilesResult> {
		const initialVault = await Promise.resolve(this.vaultService.loadVault());
		const { vault, encryptionAvailable } = this.syncEncryptionAvailability(initialVault);
		const sortedProfiles = sortProfiles(vault.profiles);
		const activeProfileId = sortedProfiles.find((profile) => profile.isActive)?.id ?? null;

		return {
			profiles: sortedProfiles.map(redactProfile),
			encryptionAvailable,
			activeProfileId
		};
	}

	async createProfile(payload: CreateProfilePayload): Promise<CreateProfileResult> {
		const parsedPayload = this.parseCreatePayload(payload);
		const vault = this.vaultService.loadVault();
		const now = this.now();
		const id = this.uuid();
		const shouldActivate = !vault.profiles.some((profile) => profile.isActive);

		const encryptionResult = this.encryptApiKey(parsedPayload.providerType, parsedPayload.apiKey);
		const candidate: LLMProfile = this.validateProfile({
			id,
			name: normalizeName(parsedPayload.name),
			providerType: parsedPayload.providerType,
			endpointUrl: normalizeEndpoint(parsedPayload.endpointUrl),
			apiKey: encryptionResult.value,
			modelId: normalizeModelId(parsedPayload.modelId),
			isActive: shouldActivate,
			consentTimestamp: parsedPayload.consentTimestamp,
			createdAt: now,
			modifiedAt: now
		});

		const persistedVault = this.vaultService.addProfile(candidate);
		const { vault: synchronizedVault } = this.syncEncryptionAvailability(persistedVault);
		const savedProfile = synchronizedVault.profiles.find((profile) => profile.id === id);
		if (!savedProfile) {
			throw new ProfileVaultWriteError(`Failed to locate profile ${id} after creation`);
		}

		await this.recordDiagnosticsEvent({
			type: "llm_profile_created",
			profileId: savedProfile.id,
			profileName: savedProfile.name,
			providerType: savedProfile.providerType,
			timestamp: now
		});

		const warnings = collectWarnings({
			existingVault: vault,
			profileName: savedProfile.name,
			excludeId: savedProfile.id,
			encryptionWarning: encryptionResult.warning
		});

		return {
			profile: redactProfile(savedProfile),
			warning: formatWarning(warnings)
		};
	}

	async updateProfile(payload: UpdateProfilePayload): Promise<UpdateProfileResult> {
		const parsedPayload = this.parseUpdatePayload(payload);
		const vault = this.vaultService.loadVault();
		const existing = vault.profiles.find((profile) => profile.id === parsedPayload.id);

		if (!existing) {
			throw new ProfileNotFoundError(parsedPayload.id);
		}

		const now = this.now();
		const providerType = parsedPayload.providerType ?? existing.providerType;
		let apiKey = existing.apiKey;
		const warnings: string[] = [];

		if (parsedPayload.apiKey !== undefined) {
			const encryptionResult = this.encryptApiKey(providerType, parsedPayload.apiKey);
			apiKey = encryptionResult.value;
			if (encryptionResult.warning) {
				warnings.push(encryptionResult.warning);
			}
		}

		const candidate: LLMProfile = this.validateProfile({
			...existing,
			name: normalizeName(parsedPayload.name ?? existing.name),
			providerType,
			endpointUrl: normalizeEndpoint(parsedPayload.endpointUrl ?? existing.endpointUrl),
			apiKey,
			modelId: parsedPayload.modelId !== undefined ? normalizeModelId(parsedPayload.modelId) : existing.modelId,
			consentTimestamp:
				parsedPayload.consentTimestamp !== undefined
					? parsedPayload.consentTimestamp
					: existing.consentTimestamp,
			modifiedAt: now
		});

		const updatedProfiles = vault.profiles.map((profile) => (profile.id === existing.id ? candidate : profile));
		const persistedVault = this.vaultService.saveVault({ ...vault, profiles: updatedProfiles });
		const { vault: synchronizedVault } = this.syncEncryptionAvailability(persistedVault);
		const savedProfile = synchronizedVault.profiles.find((profile) => profile.id === existing.id);

		if (!savedProfile) {
			throw new ProfileVaultWriteError(`Profile ${existing.id} missing after update`);
		}

		const changeSet = diffProfiles(existing, savedProfile);
		if (changeSet.length > 0) {
			await this.recordDiagnosticsEvent({
				type: "llm_profile_updated",
				profileId: savedProfile.id,
				profileName: savedProfile.name,
				providerType: savedProfile.providerType,
				changes: changeSet,
				timestamp: now
			});
		}

		const duplicateWarnings = collectWarnings({
			existingVault: vault,
			profileName: savedProfile.name,
			excludeId: savedProfile.id
		});

		return {
			profile: redactProfile(savedProfile),
			warning: formatWarning([...warnings, ...duplicateWarnings])
		};
	}

	async deleteProfile(payload: DeleteProfilePayload): Promise<DeleteProfileResult> {
		const parsedPayload = this.parseDeletePayload(payload);
		const vault = this.vaultService.loadVault();
		const target = vault.profiles.find((profile) => profile.id === parsedPayload.id);

		if (!target) {
			throw new ProfileNotFoundError(parsedPayload.id);
		}

		const now = this.now();
		let remainingProfiles = vault.profiles.filter((profile) => profile.id !== target.id);
		let newActiveProfileId: string | null = null;
		let requiresUserSelection = false;

		if (target.isActive) {
			if (parsedPayload.activateAlternateId) {
				const alternate = remainingProfiles.find((profile) => profile.id === parsedPayload.activateAlternateId);
				if (!alternate) {
					throw new AlternateProfileNotFoundError(parsedPayload.activateAlternateId);
				}

				remainingProfiles = remainingProfiles.map((profile) =>
					profile.id === alternate.id
						? { ...profile, isActive: true, modifiedAt: now }
						: profile.isActive
							? { ...profile, isActive: false, modifiedAt: now }
							: profile
				);
				newActiveProfileId = alternate.id;
			} else {
				requiresUserSelection = remainingProfiles.length > 0;
				remainingProfiles = remainingProfiles.map((profile) =>
					profile.isActive ? { ...profile, isActive: false, modifiedAt: now } : profile
				);
			}
		}

		const persistedVault = this.vaultService.saveVault({
			...vault,
			profiles: remainingProfiles
		});

		this.syncEncryptionAvailability(persistedVault);

		await this.recordDiagnosticsEvent({
			type: "llm_profile_deleted",
			profileId: target.id,
			profileName: target.name,
			providerType: target.providerType,
			timestamp: now
		});

		return {
			deletedId: target.id,
			newActiveProfileId,
			requiresUserSelection
		};
	}

	async activateProfile(payload: ActivateProfilePayload): Promise<ActivateProfileResult> {
		const parsedPayload = this.parseActivatePayload(payload);
		const vault = this.vaultService.loadVault();
		const target = vault.profiles.find((profile) => profile.id === parsedPayload.id);

		if (!target) {
			throw new ProfileNotFoundError(parsedPayload.id);
		}

		const now = this.now();
		let deactivatedProfileId: string | null = null;

		const nextProfiles = vault.profiles.map((profile) => {
			if (profile.id === target.id) {
				return { ...profile, isActive: true, modifiedAt: now };
			}

			if (profile.isActive) {
				deactivatedProfileId = profile.id;
				return { ...profile, isActive: false, modifiedAt: now };
			}

			return profile;
		});

		const persistedVault = this.vaultService.saveVault({ ...vault, profiles: nextProfiles });
		const { vault: synchronizedVault } = this.syncEncryptionAvailability(persistedVault);
		const savedProfile = synchronizedVault.profiles.find((profile) => profile.id === target.id);

		if (!savedProfile) {
			throw new ProfileVaultWriteError(`Profile ${target.id} missing after activation`);
		}

		await this.recordDiagnosticsEvent({
			type: "llm_profile_activated",
			profileId: savedProfile.id,
			profileName: savedProfile.name,
			providerType: savedProfile.providerType,
			timestamp: now
		});

		return {
			activeProfile: redactProfile(savedProfile),
			deactivatedProfileId
		};
	}

	private encryptApiKey(providerType: ProviderType, apiKey: string): EncryptionResult {
		const normalized = normalizeApiKey(providerType, apiKey);
		return this.encryptionService.encrypt(normalized);
	}

	private validateProfile(candidate: LLMProfile): LLMProfile {
		try {
			return LLMProfileSchema.parse(candidate);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new ProfileValidationError(
					`Profile validation failed: ${formatZodIssues(error)}`,
					{ details: error.flatten(), cause: error }
				);
			}
			throw error;
		}
	}

	private parseCreatePayload(payload: CreateProfilePayload): CreateProfilePayload {
		try {
			return createProfilePayloadSchema.parse(payload);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new ProfileValidationError(
					`Invalid create profile payload: ${formatZodIssues(error)}`,
					{ details: error.flatten(), cause: error }
				);
			}
			throw error;
		}
	}

	private parseUpdatePayload(payload: UpdateProfilePayload): UpdateProfilePayload {
		try {
			return updateProfilePayloadSchema.parse(payload);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new ProfileValidationError(
					`Invalid update profile payload: ${formatZodIssues(error)}`,
					{ details: error.flatten(), cause: error }
				);
			}
			throw error;
		}
	}

	private parseDeletePayload(payload: DeleteProfilePayload): DeleteProfilePayload {
		try {
			return deleteProfilePayloadSchema.parse(payload);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new ProfileValidationError(
					`Invalid delete profile payload: ${formatZodIssues(error)}`,
					{ details: error.flatten(), cause: error }
				);
			}
			throw error;
		}
	}

	private parseActivatePayload(payload: ActivateProfilePayload): ActivateProfilePayload {
		try {
			return activateProfilePayloadSchema.parse(payload);
		} catch (error) {
			if (error instanceof ZodError) {
				throw new ProfileValidationError(
					`Invalid activate profile payload: ${formatZodIssues(error)}`,
					{ details: error.flatten(), cause: error }
				);
			}
			throw error;
		}
	}

	private async recordDiagnosticsEvent(event: LlmProfileDiagnosticsEvent): Promise<void> {
		if (!this.diagnosticsRecorder) {
			return;
		}

		try {
			await Promise.resolve(this.diagnosticsRecorder.record({ ...event }));
		} catch (error) {
			console.warn("Failed to record diagnostics event", error);
		}
	}

	private syncEncryptionAvailability(vault: ProfileVault): {
		vault: ProfileVault;
		encryptionAvailable: boolean;
	} {
		const status = this.encryptionService.getStatus();
		if (vault.encryptionAvailable === status.encryptionAvailable) {
			return { vault, encryptionAvailable: status.encryptionAvailable };
		}

		const updatedVault = this.vaultService.saveVault({
			...vault,
			encryptionAvailable: status.encryptionAvailable
		});

		return { vault: updatedVault, encryptionAvailable: status.encryptionAvailable };
	}
}

function normalizeName(value: string): string {
	return value.trim();
}

function normalizeEndpoint(value: string): string {
	return value.trim();
}

function normalizeApiKey(providerType: ProviderType, value: string): string {
	const trimmed = value.trim();
	return trimmed;
}

function normalizeModelId(value: string | null): string | null {
	if (value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function formatWarning(warnings: string[]): string | undefined {
	const filtered = warnings.filter((warning) => warning && warning.trim().length > 0);
	return filtered.length > 0 ? filtered.join(" ") : undefined;
}

function diffProfiles(before: LLMProfile, after: LLMProfile): string[] {
	const differences: string[] = [];
	for (const field of TRACKED_UPDATE_FIELDS) {
		const previous = before[field];
		const next = after[field];
		if (field === "apiKey") {
			if (previous !== next) {
				differences.push(field);
			}
			continue;
		}

		if (previous !== next) {
			differences.push(field);
		}
	}
	return differences;
}

function collectWarnings(options: {
	existingVault: ProfileVault;
	profileName: string;
	excludeId?: string;
	encryptionWarning?: string | null;
}): string[] {
	const warnings: string[] = [];
	if (options.encryptionWarning) {
		warnings.push(options.encryptionWarning);
	}

	const normalizedName = options.profileName.trim().toLowerCase();
	const hasDuplicate = options.existingVault.profiles.some((profile) => {
		if (options.excludeId && profile.id === options.excludeId) {
			return false;
		}
		return profile.name.trim().toLowerCase() === normalizedName;
	});

	if (hasDuplicate) {
		warnings.push(`Profile name "${options.profileName.trim()}" already exists.`);
	}

	return warnings;
}

function redactProfile(profile: LLMProfile): RedactedProfile {
	return {
		...profile,
		apiKey: API_KEY_PLACEHOLDER
	};
}

function sortProfiles(profiles: LLMProfile[]): LLMProfile[] {
	return [...profiles].sort((a, b) => {
		if (a.isActive !== b.isActive) {
			return a.isActive ? -1 : 1;
		}
		return a.name.localeCompare(b.name, SORT_LOCALE, SORT_OPTIONS);
	});
}

function formatZodIssues(error: ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}
