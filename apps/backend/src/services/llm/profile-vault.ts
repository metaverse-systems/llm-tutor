import {
	LLMProfileSchema,
	ProfileVaultSchema,
	type LLMProfile,
	type ProfileVault
} from "@metaverse-systems/llm-tutor-shared/llm";
import { ZodError } from "zod";

const PROFILE_VAULT_VERSION = "1.0.0" as const;
export const PROFILE_VAULT_STORE_NAME = "llm-profiles" as const;
const PROFILE_VAULT_STORE_KEY = "vault" as const;

export const DEFAULT_PROFILE_VAULT: ProfileVault = Object.freeze({
	profiles: [],
	encryptionAvailable: false,
	version: PROFILE_VAULT_VERSION
});

export interface ProfileVaultStore {
	get(): ProfileVault | undefined;
	set(value: ProfileVault): void;
	clear?(): void;
}

export class ProfileVaultReadError extends Error {
	readonly code = "VAULT_READ_ERROR" as const;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "ProfileVaultReadError";
	}
}

export class ProfileVaultWriteError extends Error {
	readonly code = "VAULT_WRITE_ERROR" as const;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "ProfileVaultWriteError";
	}
}

export class ProfileNotFoundError extends Error {
	readonly code = "PROFILE_NOT_FOUND" as const;

	constructor(public readonly profileId: string) {
		super(`Profile with id ${profileId} not found`);
		this.name = "ProfileNotFoundError";
	}
}

export interface ProfileVaultServiceOptions {
	store: ProfileVaultStore;
}

type UpdateProfileInput = Partial<Omit<LLMProfile, "id" | "createdAt">> & {
	id?: string;
	createdAt?: number;
};

export class ProfileVaultService {
	private readonly store: ProfileVaultStore;

	constructor(options: ProfileVaultServiceOptions) {
		this.store = options.store;
	}

	loadVault(): ProfileVault {
		const stored = this.store.get();
		const candidate = stored ?? DEFAULT_PROFILE_VAULT;
		const parsed = parseVault(candidate, "read");

		if (!stored || !vaultsEqual(stored, parsed)) {
			this.store.set(parsed);
		}

		return cloneVault(parsed);
	}

	saveVault(vault: ProfileVault): ProfileVault {
		const parsed = parseVault(vault, "write");
		this.store.set(parsed);
		return cloneVault(parsed);
	}

	getProfile(id: string): LLMProfile | null {
		const vault = this.loadVault();
		const profile = vault.profiles.find((candidate) => candidate.id === id);
		return profile ? cloneProfile(profile) : null;
	}

	addProfile(profile: LLMProfile): ProfileVault {
		const vault = this.loadVault();
		if (vault.profiles.some((candidate) => candidate.id === profile.id)) {
			throw new ProfileVaultWriteError(`Profile with id ${profile.id} already exists`);
		}

		const nextVault: ProfileVault = {
			...vault,
			profiles: [...vault.profiles.map(cloneProfile), cloneProfile(profile)]
		};

		return this.saveVault(nextVault);
	}

	updateProfile(id: string, partial: UpdateProfileInput): LLMProfile {
		const vault = this.loadVault();
		const index = vault.profiles.findIndex((candidate) => candidate.id === id);

		if (index === -1) {
			throw new ProfileNotFoundError(id);
		}

		if (partial.id && partial.id !== id) {
			throw new ProfileVaultWriteError("Profile id cannot be changed");
		}

		const current = vault.profiles[index];

		if (partial.createdAt && partial.createdAt !== current.createdAt) {
			throw new ProfileVaultWriteError("Profile createdAt cannot be changed");
		}

		const updated: LLMProfile = {
			...current,
			...omit(partial, ["id", "createdAt"])
		};

		const nextVault: ProfileVault = {
			...vault,
			profiles: vault.profiles.map((candidate, candidateIndex) =>
				candidateIndex === index ? updated : candidate
			)
		};

		const persisted = this.saveVault(nextVault);
		const result = persisted.profiles.find((candidate) => candidate.id === id);
		return cloneProfile(result!);
	}

	deleteProfile(id: string): void {
		const vault = this.loadVault();
		if (!vault.profiles.some((candidate) => candidate.id === id)) {
			throw new ProfileNotFoundError(id);
		}

		const nextVault: ProfileVault = {
			...vault,
			profiles: vault.profiles.filter((candidate) => candidate.id !== id)
		};

		this.saveVault(nextVault);
	}

	setEncryptionAvailable(encryptionAvailable: boolean): void {
		const vault = this.loadVault();
		if (vault.encryptionAvailable === encryptionAvailable) {
			return;
		}
		this.saveVault({ ...vault, encryptionAvailable });
	}
}

function parseVault(candidate: unknown, stage: "read" | "write"): ProfileVault {
	const sanitized = sanitizeVaultCandidate(candidate ?? DEFAULT_PROFILE_VAULT);

	try {
		return ProfileVaultSchema.parse(sanitized);
	} catch (error) {
		if (error instanceof ZodError) {
			const message = `Profile vault ${stage} validation failed: ${formatZodError(error)}`;
			if (stage === "read") {
				throw new ProfileVaultReadError(message, { cause: error });
			}
			throw new ProfileVaultWriteError(message, { cause: error });
		}
		throw error;
	}
}

function sanitizeVaultCandidate(input: unknown): ProfileVault {
	const base: ProfileVault = {
		profiles: [],
		encryptionAvailable: DEFAULT_PROFILE_VAULT.encryptionAvailable,
		version: PROFILE_VAULT_VERSION
	};

	if (input && typeof input === "object") {
		const candidate = input as Partial<ProfileVault>;
		if (Array.isArray(candidate.profiles)) {
			base.profiles = dedupeProfiles(candidate.profiles);
		}
		if (typeof candidate.encryptionAvailable === "boolean") {
			base.encryptionAvailable = candidate.encryptionAvailable;
		}
		if (typeof candidate.version === "string" && candidate.version.trim().length > 0) {
			base.version = candidate.version;
		}
	}

	return enforceSingleActive(base);
}

function dedupeProfiles(input: unknown[]): LLMProfile[] {
	const seen = new Set<string>();
	const result: LLMProfile[] = [];

	for (let index = input.length - 1; index >= 0; index -= 1) {
		const candidate = input[index];
		if (!isProfileLike(candidate)) {
			continue;
		}
		if (seen.has(candidate.id)) {
			continue;
		}
		seen.add(candidate.id);
		result.unshift(cloneProfile(candidate));
	}

	return result;
}

function enforceSingleActive(vault: ProfileVault): ProfileVault {
	const activeProfiles = vault.profiles.filter((profile) => profile.isActive);

	if (activeProfiles.length <= 1) {
		return {
			...vault,
			profiles: vault.profiles.map(cloneProfile)
		};
	}

	const sorted = [...activeProfiles].sort((a, b) => {
		if (a.modifiedAt !== b.modifiedAt) {
			return b.modifiedAt - a.modifiedAt;
		}
		return b.createdAt - a.createdAt;
	});

	const keepId = sorted[0]?.id;

	return {
		...vault,
		profiles: vault.profiles.map((profile) => ({
			...cloneProfile(profile),
			isActive: profile.id === keepId
		}))
	};
}

function isProfileLike(candidate: unknown): candidate is LLMProfile {
	return (
		candidate !== null &&
		typeof candidate === "object" &&
		typeof (candidate as LLMProfile).id === "string"
	);
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
	value: T,
	exclude: readonly K[]
): Omit<T, K> {
	const result: Record<string, unknown> = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (exclude.includes(key as K)) {
			continue;
		}
		result[key] = entryValue;
	}
	return result as Omit<T, K>;
}

function formatZodError(error: ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

function vaultsEqual(a: ProfileVault | undefined, b: ProfileVault | undefined): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function cloneVault(value: ProfileVault): ProfileVault {
	return typeof globalThis.structuredClone === "function"
		? globalThis.structuredClone(value)
		: JSON.parse(JSON.stringify(value)) as ProfileVault;
}

function cloneProfile(value: LLMProfile): LLMProfile {
	return typeof globalThis.structuredClone === "function"
		? globalThis.structuredClone(value)
		: JSON.parse(JSON.stringify(value)) as LLMProfile;
}

export async function createElectronProfileVaultStore(): Promise<ProfileVaultStore> {
	const [{ default: Store }, { app }] = await Promise.all([
		import("electron-store"),
		import("electron")
	]);

	interface StoreShape {
		[PROFILE_VAULT_STORE_KEY]: ProfileVault;
	}

	const store = new Store<StoreShape>({
		name: PROFILE_VAULT_STORE_NAME,
		cwd: app.getPath("userData"),
		defaults: { [PROFILE_VAULT_STORE_KEY]: DEFAULT_PROFILE_VAULT }
	});

	return {
		get(): ProfileVault | undefined {
			return store.get(PROFILE_VAULT_STORE_KEY);
		},
		set(value: ProfileVault): void {
			store.set(PROFILE_VAULT_STORE_KEY, cloneVault(value));
		},
		clear(): void {
			store.clear();
		}
	};
}

export function createInMemoryProfileVaultStore(initial?: ProfileVault): ProfileVaultStore {
	let snapshot = initial ? cloneVault(initial) : undefined;

	return {
		get(): ProfileVault | undefined {
			return snapshot ? cloneVault(snapshot) : undefined;
		},
		set(value: ProfileVault): void {
			snapshot = cloneVault(value);
		},
		clear(): void {
			snapshot = undefined;
		}
	};
}

export function validateProfile(profile: LLMProfile): LLMProfile {
	return LLMProfileSchema.parse(profile);
}
