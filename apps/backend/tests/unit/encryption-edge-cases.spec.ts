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

describe("EncryptionService edge cases", () => {
	it("handles empty string encryption and decryption", () => {
		const safeStorage = createMockSafeStorage();
		const service = new EncryptionService({ safeStorage });

		const encrypted = service.encrypt("");

		expect(encrypted.wasEncrypted).toBe(true);
		expect(encrypted.warning).toBeUndefined();
		expect(encrypted.value).toBe(Buffer.from("cipher:", "utf8").toString("base64"));

		const decrypted = service.decrypt(encrypted.value);
		expect(decrypted.wasDecrypted).toBe(true);
		expect(decrypted.value).toBe("");
	});

	it("supports very long API keys", () => {
		const safeStorage = createMockSafeStorage();
		const service = new EncryptionService({ safeStorage });
		const longApiKey = "a".repeat(500);

		const encrypted = service.encrypt(longApiKey);

		expect(encrypted.wasEncrypted).toBe(true);
		expect(encrypted.value.length).toBeGreaterThan(0);

		const decrypted = service.decrypt(encrypted.value);
		expect(decrypted.wasDecrypted).toBe(true);
		expect(decrypted.value).toBe(longApiKey);
	});

	it("preserves unicode secrets", () => {
		const safeStorage = createMockSafeStorage();
		const service = new EncryptionService({ safeStorage });
		const secret = "🔐秘密パスワード🌟";

		const encrypted = service.encrypt(secret);

		expect(encrypted.wasEncrypted).toBe(true);
		expect(() => Buffer.from(encrypted.value, "base64")).not.toThrow();

		const decrypted = service.decrypt(encrypted.value);
		expect(decrypted.wasDecrypted).toBe(true);
		expect(decrypted.value).toBe(secret);
	});

	it("falls back gracefully when encryption unavailable on linux", () => {
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			isEncryptionAvailable: vi.fn(() => false)
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy, platform: "linux" });

		const result = service.encrypt("top-secret-token");

		expect(result.wasEncrypted).toBe(false);
		expect(result.value).toBe("top-secret-token");
		expect(result.warning).toMatch(/plaintext/i);
		expect(fallbackSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: "unavailable",
				operation: "encrypt",
				platform: "linux"
			})
		);

		const status = service.getStatus();
		expect(status.encryptionAvailable).toBe(false);
		expect(status.lastFallbackEvent).toMatchObject({
			operation: "encrypt",
			reason: "unavailable",
			platform: "linux"
		});
	});

	it("returns stored value when decrypting invalid ciphertext", () => {
		const error = new Error("invalid ciphertext");
		const fallbackSpy = vi.fn();
		const safeStorage = createMockSafeStorage({
			decryptString: vi.fn(() => {
				throw error;
			})
		});
		const service = new EncryptionService({ safeStorage, onFallback: fallbackSpy });
		const bogusCiphertext = Buffer.from("cipher:data", "utf8").toString("base64");

		const result = service.decrypt(bogusCiphertext);

		expect(result.wasDecrypted).toBe(false);
		expect(result.value).toBe(bogusCiphertext);
		expect(result.warning).toMatch(/failed to decrypt/i);
		expect(fallbackSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: "decrypt-error",
				error: { name: "Error", message: "invalid ciphertext" }
			})
		);

		const status = service.getStatus();
		expect(status.lastFallbackEvent).toMatchObject({ reason: "decrypt-error", operation: "decrypt" });
	});
});
