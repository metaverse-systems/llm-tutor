import { ProfileVaultService, ProfileVaultReadError, ProfileVaultWriteError, type ProfileVaultStore } from "../../services/llm/profile-vault.js";
import { ProfileService } from "../../services/llm/profile.service.js";
import { TestPromptService } from "../../services/llm/test-prompt.service.js";
import { EncryptionService } from "../../infra/encryption/index.js";
import type { ProfileVault } from "@metaverse-systems/llm-tutor-shared/llm";
import type { LlmContractTestHarness, ProfileVaultSeed } from "../../../tests/contract/llm/helpers.js";
import { Buffer } from "node:buffer";

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
			fetchImpl: async () => {
				return new Response(
					JSON.stringify({
						choices: [{ message: { content: "Test response" } }],
						model: "test-model"
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" }
					}
				);
			},
			timeoutMs: 30000,
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
					const result = await this.profileService.createProfile(payload as any);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:update": {
					const result = await this.profileService.updateProfile(payload as any);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:delete": {
					const result = await this.profileService.deleteProfile(payload as any);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:activate": {
					const result = await this.profileService.activateProfile(payload as any);
					return {
						success: true,
						data: result,
						timestamp
					};
				}

				case "llm:profiles:test": {
					const result = await this.testPromptService.testPrompt(payload as any);
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
		} catch (error: any) {
			if (error.code === "VAULT_READ_ERROR") {
				return {
					error: "VAULT_READ_ERROR",
					message: error.message,
					details: error.cause,
					timestamp
				};
			}

			if (error.code === "VAULT_WRITE_ERROR") {
				return {
					error: "VAULT_WRITE_ERROR",
					message: error.message,
					details: error.cause,
					timestamp
				};
			}

			if (error.code === "VALIDATION_ERROR") {
				return {
					error: "VALIDATION_ERROR",
					message: error.message,
					details: error.details,
					timestamp
				};
			}

			if (error.code === "PROFILE_NOT_FOUND") {
				return {
					error: "PROFILE_NOT_FOUND",
					message: error.message,
					timestamp
				};
			}

			if (error.code === "ALTERNATE_NOT_FOUND") {
				return {
					error: "ALTERNATE_NOT_FOUND",
					message: error.message,
					timestamp
				};
			}

			if (error.code === "NO_ACTIVE_PROFILE") {
				return {
					error: "NO_ACTIVE_PROFILE",
					message: error.message,
					timestamp
				};
			}

			if (error.code === "TIMEOUT") {
				return {
					error: "TIMEOUT",
					message: error.message,
					timestamp
				};
			}

			if (channel === "llm:profiles:discover") {
				return {
					error: "DISCOVERY_ERROR",
					message: error.message,
					details: error,
					timestamp
				};
			}

			throw error;
		}
	}

	async seedVault(seed: ProfileVaultSeed): Promise<void> {
		this.state.vault = seed as ProfileVault;
		this.state.vaultReadError = null;
		this.state.vaultWriteError = null;
	}

	async clearVault(): Promise<void> {
		this.state.vault = null;
		this.state.vaultReadError = null;
		this.state.vaultWriteError = null;
	}

	async simulateVaultReadError(error?: Error): Promise<void> {
		this.state.vaultReadError = error ?? new Error("Vault read error");
	}

	async simulateVaultWriteError(error?: Error): Promise<void> {
		this.state.vaultWriteError = error ?? new Error("Vault write error");
	}

	async simulateDiscoveryResult(result: {
		discovered: boolean;
		discoveredUrl: string | null;
		profileCreated: boolean;
		profileId: string | null;
		probedPorts?: number[];
	}): Promise<void> {
		this.state.discoveryResult = result;
		this.state.discoveryError = null;
	}

	async simulateDiscoveryError(error?: Error): Promise<void> {
		this.state.discoveryError = error ?? new Error("Discovery error");
		this.state.discoveryResult = null;
	}

	async readDiagnosticsEvents(): Promise<unknown[]> {
		return [];
	}

	async close(): Promise<void> {
		// Nothing to clean up in memory
	}
}

export async function createLLMContractTestHarness(options?: {
	initialVault?: ProfileVaultSeed | null;
}): Promise<LlmContractTestHarness> {
	return new ContractTestHarness(options?.initialVault as ProfileVault | null | undefined);
}
