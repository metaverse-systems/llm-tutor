import { Buffer } from "node:buffer";

export interface SafeStorageAdapter {
	isEncryptionAvailable(): boolean;
	encryptString(plaintext: string): Buffer;
	decryptString(buffer: Buffer): string;
}

export type EncryptionOperation = "encrypt" | "decrypt" | "status";

export type EncryptionFallbackReason = "unavailable" | "encrypt-error" | "decrypt-error";

export interface EncryptionFallbackEvent {
	type: "llm_encryption_unavailable";
	timestamp: number;
	platform: NodeJS.Platform;
	operation: EncryptionOperation;
	reason: EncryptionFallbackReason;
	message: string;
	error?: {
		name: string;
		message: string;
	};
}

export interface EncryptionStatus {
	encryptionAvailable: boolean;
	lastFallbackEvent: EncryptionFallbackEvent | null;
}

export interface EncryptionResult {
	value: string;
	wasEncrypted: boolean;
	warning?: string;
	fallbackEvent?: EncryptionFallbackEvent;
}

export interface DecryptionResult {
	value: string;
	wasDecrypted: boolean;
	warning?: string;
	fallbackEvent?: EncryptionFallbackEvent;
}

export interface EncryptionServiceOptions {
	safeStorage?: SafeStorageAdapter | null;
	onFallback?: (event: EncryptionFallbackEvent) => void;
	now?: () => Date;
	platform?: NodeJS.Platform;
}

const ENCRYPT_UNAVAILABLE_WARNING =
	"System keychain is unavailable; sensitive credentials will be stored in plaintext.";
const ENCRYPT_ERROR_WARNING =
	"System keychain failed to encrypt the credential; storing plaintext instead.";
const DECRYPT_ERROR_WARNING =
	"System keychain failed to decrypt the credential; returning stored value as-is.";
const DECRYPT_UNAVAILABLE_WARNING =
	"System keychain is unavailable; returning stored credential without decryption.";

export class EncryptionService {
	private readonly safeStorage: SafeStorageAdapter | null;
	private readonly onFallback?: (event: EncryptionFallbackEvent) => void;
	private readonly now: () => Date;
	private readonly platform: NodeJS.Platform;
	private lastFallbackEvent: EncryptionFallbackEvent | null = null;

	constructor(options: EncryptionServiceOptions = {}) {
		this.safeStorage = options.safeStorage ?? null;
		this.onFallback = options.onFallback;
		this.now = options.now ?? (() => new Date());
		this.platform = options.platform ?? process.platform;
	}

	isEncryptionAvailable(): boolean {
		if (!this.safeStorage) {
			return false;
		}

		try {
			return this.safeStorage.isEncryptionAvailable();
		} catch (error) {
			this.emitFallback("status", "unavailable", error);
			return false;
		}
	}

	encrypt(plaintext: string): EncryptionResult {
		if (!this.safeStorage || !this.safeStorageIsReady()) {
			const event = this.emitFallback("encrypt", "unavailable");
			return {
				value: plaintext,
				wasEncrypted: false,
				warning: event.message,
				fallbackEvent: event
			};
		}

		try {
			const encryptedBuffer = this.safeStorage.encryptString(plaintext);
			return {
				value: encryptedBuffer.toString("base64"),
				wasEncrypted: true
			};
		} catch (error) {
			const event = this.emitFallback("encrypt", "encrypt-error", error);
			return {
				value: plaintext,
				wasEncrypted: false,
				warning: event.message,
				fallbackEvent: event
			};
		}
	}

	decrypt(value: string): DecryptionResult {
		if (!this.safeStorage || !this.safeStorageIsReady()) {
			const event = this.emitFallback("decrypt", "unavailable");
			return {
				value,
				wasDecrypted: false,
				warning: event.message,
				fallbackEvent: event
			};
		}

		try {
			const buffer = Buffer.from(value, "base64");
			const plaintext = this.safeStorage.decryptString(buffer);
			return {
				value: plaintext,
				wasDecrypted: true
			};
		} catch (error) {
			const event = this.emitFallback("decrypt", "decrypt-error", error);
			return {
				value,
				wasDecrypted: false,
				warning: event.message,
				fallbackEvent: event
			};
		}
	}

	getStatus(): EncryptionStatus {
		return {
			encryptionAvailable: this.safeStorageIsReady(),
			lastFallbackEvent: this.lastFallbackEvent
		};
	}

	private safeStorageIsReady(): boolean {
		if (!this.safeStorage) {
			return false;
		}

		try {
			return this.safeStorage.isEncryptionAvailable();
		} catch {
			return false;
		}
	}

	private emitFallback(
		operation: EncryptionOperation,
		reason: EncryptionFallbackReason,
		error?: unknown
	): EncryptionFallbackEvent {
		const message = this.warningFor(operation, reason);
		const event: EncryptionFallbackEvent = {
			type: "llm_encryption_unavailable",
			timestamp: this.now().getTime(),
			platform: this.platform,
			operation,
			reason,
			message,
			error: this.normalizeError(error)
		};

		this.lastFallbackEvent = event;
		this.onFallback?.(event);
		return event;
	}

	private warningFor(operation: EncryptionOperation, reason: EncryptionFallbackReason): string {
		if (reason === "encrypt-error") {
			return ENCRYPT_ERROR_WARNING;
		}

		if (reason === "decrypt-error") {
			return DECRYPT_ERROR_WARNING;
		}

		return operation === "decrypt" ? DECRYPT_UNAVAILABLE_WARNING : ENCRYPT_UNAVAILABLE_WARNING;
	}

	private normalizeError(error: unknown): EncryptionFallbackEvent["error"] | undefined {
		if (!error) {
			return undefined;
		}

		if (error instanceof Error) {
			return { name: error.name, message: error.message };
		}

		if (typeof error === "object" && error !== null) {
			const candidate = error as Record<string, unknown>;
			const name = typeof candidate.name === "string" ? candidate.name : "UnknownError";
			const message = typeof candidate.message === "string" ? candidate.message : JSON.stringify(candidate);
			return { name, message };
		}

		if (typeof error === "string") {
			return { name: "UnknownError", message: error };
		}

		if (typeof error === "number" || typeof error === "boolean") {
			return { name: "UnknownError", message: String(error) };
		}

		return { name: "UnknownError", message: JSON.stringify(error) };
	}
}
