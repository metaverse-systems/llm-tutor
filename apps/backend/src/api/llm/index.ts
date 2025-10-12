import type { ProfileVault } from "@metaverse-systems/llm-tutor-shared/llm";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { EncryptionService } from "../../infra/encryption/index.js";
import { ProfileVaultService, ProfileVaultReadError, ProfileVaultWriteError, type ProfileVaultStore } from "../../services/llm/profile-vault.js";
import { ProfileService, type ActivateProfilePayload, type CreateProfilePayload, type DeleteProfilePayload, type UpdateProfilePayload } from "../../services/llm/profile.service.js";
import { TestPromptService, type TestPromptRequest } from "../../services/llm/test-prompt.service.js";



interface TestState {
	vault: ProfileVault | null;
	vaultReadError: Error | null;
	vaultWriteError: Error | null;
	discoveryResult: {
		discovered: boolean;
		discoveredUrl: string | null;
		profileCreated: boolean;
		profileId: string | null;
		probedPorts?: number[];
	} | null;
	discoveryError: Error | null;
}

type ProfileVaultSeed = ProfileVault;

export interface LlmContractTestHarness {
	invoke(channel: string, payload?: unknown): Promise<unknown>;
	seedVault(seed: ProfileVaultSeed): Promise<void>;
	clearVault(): Promise<void>;
	simulateVaultReadError(error?: Error): Promise<void>;
	simulateVaultWriteError(error?: Error): Promise<void>;
	simulateDiscoveryResult?(result: {
		discovered: boolean;
		discoveredUrl: string | null;
		profileCreated: boolean;
		profileId: string | null;
		probedPorts?: number[];
	}): Promise<void>;
	simulateDiscoveryError?(error?: Error): Promise<void>;
	readDiagnosticsEvents?(): Promise<unknown[]>;
	close(): Promise<void>;
}

class InMemoryVaultStore implements ProfileVaultStore {
	private state: TestState;

	constructor(state: TestState, initialVault?: ProfileVault | null) {
		this.state = state;
		if (initialVault) {
			this.state.vault = initialVault;
		}
	}

	get(): ProfileVault | undefined {
		if (this.state.vaultReadError) {
			throw new ProfileVaultReadError(this.state.vaultReadError.message, {
				cause: this.state.vaultReadError
			});
		}
		return this.state.vault ?? undefined;
	}

	set(value: ProfileVault): void {
		if (this.state.vaultWriteError) {
			throw new ProfileVaultWriteError(this.state.vaultWriteError.message, {
				cause: this.state.vaultWriteError
			});
		}
		this.state.vault = value;
	}

	clear(): void {
		this.state.vault = null;
	}
}

const createProfilePayloadSchema = z
	.object({
		name: z.string().min(1).max(100),
		providerType: z.enum(["llama.cpp", "azure", "custom"]),
		endpointUrl: z.string().min(1),
		apiKey: z.string().max(500),
		modelId: z.union([z.string().max(200), z.null()]),
		consentTimestamp: z.number().int().nonnegative().nullable()
	})
	.strict();

const updateProfilePayloadSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string().min(1).max(100).optional(),
		providerType: z.enum(["llama.cpp", "azure", "custom"]).optional(),
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

const testPromptRequestSchema = z
	.object({
		profileId: z.string().uuid().optional(),
		promptText: z.string().optional()
	})
	.strict();

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown, channel: string): T {
	try {
		return schema.parse(payload);
	} catch (error) {
		const message = error instanceof z.ZodError ? error.message : "Invalid payload";
		throw new Error(`Invalid payload for ${channel}: ${message}`);
	}
}

function parseError(error: unknown): {
	code?: string;
	message: string;
	details?: unknown;
	cause?: unknown;
} {
	if (error instanceof Error) {
		const enriched = error as Error & { code?: string; details?: unknown };
		return {
			code: typeof enriched.code === "string" ? enriched.code : undefined,
			message: enriched.message,
			details: enriched.details,
			cause: (enriched as Error & { cause?: unknown }).cause
		};
	}

	if (typeof error === "object" && error !== null) {
		const candidate = error as Record<string, unknown>;
		return {
			code: typeof candidate.code === "string" ? candidate.code : undefined,
			message: typeof candidate.message === "string" ? candidate.message : "Unknown error",
			details: candidate.details,
			cause: candidate.cause
		};
	}

	return {
		message: typeof error === "string" ? error : "Unknown error"
	};
}

function parseRequestBody(body: unknown): Record<string, unknown> | null {
	if (typeof body === "string") {
		try {
			const parsed = JSON.parse(body) as unknown;
			return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
		} catch {
			return null;
		}
	}

	if (body instanceof Buffer) {
		return parseRequestBody(body.toString("utf8"));
	}

	return null;
}

function extractPromptText(requestBody: Record<string, unknown> | null): string {
	if (!requestBody) {
		return "";
	}

	const prompt = requestBody.prompt;
	if (typeof prompt === "string") {
		return prompt;
	}

	const messages = requestBody.messages;
	if (Array.isArray(messages) && messages.length > 0) {
		const first: unknown = messages[0];
		if (first && typeof first === "object" && "content" in first) {
			const content = (first as Record<string, unknown>).content;
			if (typeof content === "string") {
				return content;
			}
		}
	}

	return "";
}

class ContractTestHarness implements LlmContractTestHarness {
	private state: TestState;
	private vaultService: ProfileVaultService;
	private profileService: ProfileService;
	private testPromptService: TestPromptService;

	constructor(initialVault?: ProfileVault | null) {
		this.state = {
			vault: initialVault ?? null,
			vaultReadError: null,
			vaultWriteError: null,
			discoveryResult: null,
			discoveryError: null
		};

		const store = new InMemoryVaultStore(this.state, initialVault);
		this.vaultService = new ProfileVaultService({ store });
		
		const encryptionService = new EncryptionService({
			safeStorage: {
				isEncryptionAvailable: () => true,
				encryptString: (plaintext: string) => Buffer.from(plaintext, "utf8"),
				decryptString: (buffer: Buffer) => buffer.toString("utf8")
			}
		});

		this.profileService = new ProfileService({
			vaultService: this.vaultService,
			encryptionService,
			diagnosticsRecorder: null
		});

		this.testPromptService = new TestPromptService({
			vaultService: this.vaultService,
			encryptionService,
			// Use smart mocking: mock for contract tests, real fetch for integration tests with nock
			fetchImpl: async (requestInfo: RequestInfo | URL, init?: RequestInit) => {
				const url = requestInfo instanceof URL
					? requestInfo
					: new URL(typeof requestInfo === "string" ? requestInfo : requestInfo.url);
				const urlString = url.toString();
				const parsedBody = parseRequestBody(init?.body ?? null);
				const promptText = extractPromptText(parsedBody);
				const signal = init?.signal;
				
				// Handle timeout simulation (contract test specific)
				if (promptText.includes("Simulate timeout")) {
					return new Promise((_resolve, reject) => {
						if (signal) {
							signal.addEventListener("abort", () => {
								const error = new Error("The operation was aborted");
								error.name = "AbortError";
								reject(error);
							});
						}
						// Intentionally never resolve to simulate a hung request until abort triggers
					});
				}
				
				// Try real fetch first (for integration tests with nock)
				try {
					return await globalThis.fetch(requestInfo, init);
				} catch (fetchError: unknown) {
					// If fetch fails and we're testing localhost, provide a mock response
					if (urlString.includes("localhost:8080")) {
						// Handle error simulation
						if (promptText.includes("Cause an error")) {
							return new Response(
								JSON.stringify({ error: { message: "Simulated provider error" } }),
								{
									status: 500,
									headers: { "content-type": "application/json" }
								}
							);
						}
						
						// Default success response for contract tests
						return new Response(
							JSON.stringify({
								choices: [{ text: "Test response from llama.cpp" }],
								model: "llama-2-7b"
							}),
							{
								status: 200,
								headers: { "content-type": "application/json" }
							}
						);
					}
					
					// Re-throw for non-localhost errors
					throw fetchError;
				}
			},
			timeoutMs: 1000, // Short timeout for tests
			diagnosticsRecorder: null
		});
	}

	async invoke(channel: string, payload?: unknown): Promise<unknown> {
		const timestamp = Date.now();

		try {
			switch (channel) {
				case "llm:profiles:list": {
					const result = await this.profileService.listProfiles();
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:create": {
					const parsedPayload = parsePayload<CreateProfilePayload>(createProfilePayloadSchema, payload, channel);
					const result = await this.profileService.createProfile(parsedPayload);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:update": {
					const parsedPayload = parsePayload<UpdateProfilePayload>(updateProfilePayloadSchema, payload, channel);
					const result = await this.profileService.updateProfile(parsedPayload);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:delete": {
					const parsedPayload = parsePayload<DeleteProfilePayload>(deleteProfilePayloadSchema, payload, channel);
					const result = await this.profileService.deleteProfile(parsedPayload);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:activate": {
					const parsedPayload = parsePayload<ActivateProfilePayload>(activateProfilePayloadSchema, payload, channel);
					const result = await this.profileService.activateProfile(parsedPayload);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:test": {
					const parsedPayload = parsePayload<TestPromptRequest>(testPromptRequestSchema, payload, channel);
					const result = await this.testPromptService.testPrompt(parsedPayload);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:discover": {
					if (this.state.discoveryError) {
						throw this.state.discoveryError;
					}

					const result = this.state.discoveryResult ?? {
						discovered: false,
						discoveredUrl: null,
						profileCreated: false,
						profileId: null,
						probedPorts: []
					};

					return {
						success: true,
						data: result,
						timestamp
					};
				}

				default:
					throw new Error(`Unknown channel: ${channel}`);
			}
		} catch (unknownError: unknown) {
			const { code, message, details, cause } = parseError(unknownError);
			if (code === "VAULT_READ_ERROR") {
				return {
					error: "VAULT_READ_ERROR",
					message,
					details: cause ?? details,
					timestamp
				};
			}

			if (code === "VAULT_WRITE_ERROR") {
				return {
					error: "VAULT_WRITE_ERROR",
					message,
					details: cause ?? details,
					timestamp
				};
			}

			if (code === "VALIDATION_ERROR") {
				return {
					error: "VALIDATION_ERROR",
					message,
					details,
					timestamp
				};
			}

			if (code === "PROFILE_NOT_FOUND") {
				return {
					error: "PROFILE_NOT_FOUND",
					message,
					timestamp
				};
			}

			if (code === "ALTERNATE_NOT_FOUND") {
				return {
					error: "ALTERNATE_NOT_FOUND",
					message,
					timestamp
				};
			}

			if (code === "NO_ACTIVE_PROFILE") {
				return {
					error: "NO_ACTIVE_PROFILE",
					message,
					timestamp
				};
			}

			if (code === "TIMEOUT") {
				return {
					error: "TIMEOUT",
					message,
					timestamp
				};
			}

			if (channel === "llm:profiles:discover") {
				return {
					error: "DISCOVERY_ERROR",
					message,
					details: unknownError,
					timestamp
				};
			}

			throw unknownError;
		}
	}

	seedVault(seed: ProfileVaultSeed): Promise<void> {
		this.state.vault = seed;
		this.state.vaultReadError = null;
		this.state.vaultWriteError = null;
		return Promise.resolve();
	}

	clearVault(): Promise<void> {
		this.state.vault = null;
		this.state.vaultReadError = null;
		this.state.vaultWriteError = null;
		return Promise.resolve();
	}

	simulateVaultReadError(error?: Error): Promise<void> {
		this.state.vaultReadError = error ?? new Error("Vault read error");
		return Promise.resolve();
	}

	simulateVaultWriteError(error?: Error): Promise<void> {
		this.state.vaultWriteError = error ?? new Error("Vault write error");
		return Promise.resolve();
	}

	simulateDiscoveryResult(result: {
		discovered: boolean;
		discoveredUrl: string | null;
		profileCreated: boolean;
		profileId: string | null;
		probedPorts?: number[];
	}): Promise<void> {
		this.state.discoveryResult = result;
		this.state.discoveryError = null;
		return Promise.resolve();
	}

	simulateDiscoveryError(error?: Error): Promise<void> {
		this.state.discoveryError = error ?? new Error("Discovery error");
		this.state.discoveryResult = null;
		return Promise.resolve();
	}

	readDiagnosticsEvents(): Promise<unknown[]> {
		return Promise.resolve([]);
	}

	close(): Promise<void> {
		// Nothing to clean up in memory
		return Promise.resolve();
	}
}

export function createLLMContractTestHarness(options?: {
	initialVault?: ProfileVaultSeed | null;
}): Promise<LlmContractTestHarness> {
	return Promise.resolve(
		new ContractTestHarness(options?.initialVault ?? null)
	);
}
