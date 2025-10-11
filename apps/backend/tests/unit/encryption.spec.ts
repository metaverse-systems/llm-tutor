import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { EncryptionService, type SafeStorageAdapter } from "../../src/infra/encryption/index.js";

function createMockSafeStorage(overrides: Partial<SafeStorageAdapter> = {}): SafeStorageAdapter {
	const base: SafeStorageAdapter = {
		isEncryptionAvailable: vi.fn(() => true),
		encryptString: vi.fn((plaintext: string) => Buffer.from(`cipher:${plaintext}`, "utf8")),
		decryptString: vi.fn((buffer: Buffer) => buffer.toString("utf8").replace(/^cipher:/, ""))
	};

	return { ...base, ...overrides } satisfies SafeStorageAdapter;
}

describe("EncryptionService", () => {
	it("encrypts using safeStorage when available", () => {
		const safeStorage = createMockSafeStorage();
		const service = new EncryptionService({ safeStorage });

		const result = service.encrypt("super-secret");

		expect(result.wasEncrypted).toBe(true);
		expect(result.warning).toBeUndefined();
		expect(result.value).toBe(Buffer.from("cipher:super-secret", "utf8").toString("base64"));
		expect(safeStorage.encryptString).toHaveBeenCalledWith("super-secret");

		const decrypted = service.decrypt(result.value);
		expect(decrypted.wasDecrypted).toBe(true);
		expect(decrypted.value).toBe("super-secret");
		expect(safeStorage.decryptString).toHaveBeenCalled();
	});

	it("falls back to plaintext when safeStorage reports unavailable", () => {
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			isEncryptionAvailable: vi.fn(() => false)
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy, platform: "linux" });

		const result = service.encrypt("api-key-123");

		expect(result.wasEncrypted).toBe(false);
		expect(result.value).toBe("api-key-123");
		expect(result.warning).toMatch(/plaintext/i);
		expect(fallbackSpy).toHaveBeenCalledTimes(1);
		expect(fallbackSpy.mock.calls[0][0]).toMatchObject({
			type: "llm_encryption_unavailable",
			reason: "unavailable",
			operation: "encrypt",
			platform: "linux"
		});
	});

	it("logs fallback when encryption throws", () => {
		const error = new Error("boom");
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			encryptString: vi.fn(() => {
				throw error;
			})
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy });

		const result = service.encrypt("credential");

		expect(result.wasEncrypted).toBe(false);
		expect(result.warning).toMatch(/failed to encrypt/i);
		expect(fallbackSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: "encrypt-error",
				error: { name: "Error", message: "boom" }
			})
		);
	});

	it("returns value as-is when decrypting without safeStorage", () => {
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			isEncryptionAvailable: vi.fn(() => false)
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy });

		const result = service.decrypt("stored-plaintext");

		expect(result.wasDecrypted).toBe(false);
		expect(result.value).toBe("stored-plaintext");
		expect(result.warning).toMatch(/without decryption/i);
		expect(fallbackSpy).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "unavailable", operation: "decrypt" })
		);
	});

	it("captures last fallback event in status", () => {
		const safeStorage = createMockSafeStorage({
			isEncryptionAvailable: vi.fn(() => false)
		});
		const service = new EncryptionService({ safeStorage });

		const initialStatus = service.getStatus();
		expect(initialStatus.encryptionAvailable).toBe(false);
		expect(initialStatus.lastFallbackEvent).toBeNull();

		service.encrypt("credential");

		const status = service.getStatus();
		expect(status.encryptionAvailable).toBe(false);
		expect(status.lastFallbackEvent).not.toBeNull();
		expect(status.lastFallbackEvent).toMatchObject({ operation: "encrypt", reason: "unavailable" });
	});

	it("reports unavailable when safeStorage.isEncryptionAvailable throws", () => {
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			isEncryptionAvailable: vi.fn(() => {
				throw new Error("keychain offline");
			})
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy });

		const available = service.isEncryptionAvailable();

		expect(available).toBe(false);
		expect(fallbackSpy).toHaveBeenCalledWith(
			expect.objectContaining({ operation: "status", reason: "unavailable" })
		);
	});
});
