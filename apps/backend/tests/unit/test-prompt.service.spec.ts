import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { EncryptionService } from "../../src/infra/encryption/index.js";
import {
	DEFAULT_PROFILE_VAULT,
	ProfileVaultService,
	createInMemoryProfileVaultStore
} from "../../src/services/llm/profile-vault.js";
import {
	NoActiveProfileError,
	TestPromptService,
	TestPromptTimeoutError
} from "../../src/services/llm/test-prompt.service.js";
import type {
	LLMProfile,
	ProfileVault,
	TestPromptResult
} from "@metaverse-systems/llm-tutor-shared/llm";
import type { TestPromptDiagnosticsEvent } from "../../src/services/llm/test-prompt.service.js";

interface TestHarness {
	service: TestPromptService;
	diagnostics: TestPromptResult[];
	fetchMock: ReturnType<typeof vi.fn>;
	encryptionDecryptMock: MockInstance<(value: string) => ReturnType<EncryptionService["decrypt"]>>;
	vaultService: ProfileVaultService;
}

const FIXED_NOW = 1_715_000_000_000;

const DEFAULT_PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const AZURE_PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function createProfile(overrides: Partial<LLMProfile> = {}): LLMProfile {
	return {
		id: DEFAULT_PROFILE_ID,
		name: "Local llama",
		providerType: "llama.cpp",
		endpointUrl: "http://localhost:11434",
		apiKey: "local-key",
		modelId: "llama-2",
		isActive: true,
		consentTimestamp: null,
		createdAt: 1_700_000_000,
		modifiedAt: 1_700_000_500,
		...overrides
	};
}

function createVault(profiles: LLMProfile[], overrides: Partial<ProfileVault> = {}): ProfileVault {
	return {
		...DEFAULT_PROFILE_VAULT,
		profiles,
		...overrides
	};
}

function createHarness(options?: {
	profiles?: LLMProfile[];
	timeoutMs?: number;
	fetchImplementation?: ReturnType<typeof vi.fn>;
}): TestHarness {
	const store = createInMemoryProfileVaultStore(createVault(options?.profiles ?? [createProfile()]));
	const vaultService = new ProfileVaultService({ store });
	const diagnostics: TestPromptResult[] = [];

	const encryptionService = new EncryptionService();
	const encryptionDecryptMock = vi
		.spyOn(encryptionService, "decrypt")
		.mockImplementation((value: string) => ({ value, wasDecrypted: false }));

	const fetchMock =
		options?.fetchImplementation ??
		vi.fn(async () =>
			new Response(
				JSON.stringify({
					model: "llama-2",
					choices: [
						{
							message: {
								role: "assistant",
								content: "Hello world"
							}
						}
					]
				})
			)
		);

	const diagnosticsRecorder = {
		record: vi.fn((event: TestPromptDiagnosticsEvent) => {
			diagnostics.push(event.result);
		})
	};

	const service = new TestPromptService({
		vaultService,
		encryptionService,
		fetchImpl: fetchMock,
		timeoutMs: options?.timeoutMs,
		diagnosticsRecorder,
		now: () => FIXED_NOW
	});

	return { service, diagnostics, fetchMock, encryptionDecryptMock, vaultService };
}

function queuePerformanceTimes(values: number[]): void {
	let index = 0;
	vi.spyOn(performance, "now").mockImplementation(() => {
		const next = values[index];
		if (next === undefined) {
			throw new Error("performance.now exhausted");
		}
		index += 1;
		return next;
	});
}

describe("TestPromptService", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns sanitized truncated success result for llama.cpp provider", async () => {
		const longResponse = `\u001B[31mHello\u001B[0m ${"a".repeat(600)}\u0007`;
		const fetchResponse = new Response(
			JSON.stringify({
				model: null,
				choices: [
					{
						message: {
							role: "assistant",
							content: longResponse
						}
					}
				]
			})
		);
		const fetchMock = vi.fn(async () => fetchResponse);
		const harness = createHarness({ fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 45, 90]);

		const result = await harness.service.testPrompt({ promptText: "Test please" });

		expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/v1/chat/completions", expect.objectContaining({
			method: "POST"
		}));
		expect(result.success).toBe(true);
		expect(result.profileId).toBe(DEFAULT_PROFILE_ID);
		expect(result.promptText).toBe("Test please");
		expect(result.modelName).toBe("llama-2");
		expect(result.latencyMs).toBe(45);
		expect(result.totalTimeMs).toBe(90);
		expect(result.responseText).not.toContain("\u001B");
		expect(result.responseText).not.toContain("\u0007");
		expect(result.responseText).toHaveLength(500);
		expect(result.responseText?.endsWith("...")).toBe(true);
		expect(result.timestamp).toBe(FIXED_NOW);
		expect(harness.diagnostics).toHaveLength(1);
		expect(harness.diagnostics[0]).toEqual(result);
	});

	it("maps azure HTTP errors to descriptive failure result", async () => {
		const azureProfile = createProfile({
			id: AZURE_PROFILE_ID,
			name: "Azure GPT",
			providerType: "azure",
			endpointUrl: "https://workspace.openai.azure.com",
			modelId: "gpt-4o",
			consentTimestamp: 1_700_000_100,
			isActive: true,
			apiKey: "azure-key"
		});
		const body = {
			error: { code: "401", message: "Authentication failed" }
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 401 }));
		const harness = createHarness({ profiles: [azureProfile], fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 30, 55]);

		const result = await harness.service.testPrompt({ promptText: "Say hi" });

		expect(result.success).toBe(false);
		expect(result.errorCode).toBe("401");
		expect(result.errorMessage).toBe("Invalid API key. Check your credentials.");
		expect(result.latencyMs).toBeNull();
		expect(result.totalTimeMs).toBe(55);
		expect(result.modelName).toBeNull();
		expect(harness.diagnostics[0]).toEqual(result);
	});

	it("maps network errors with friendly message and diagnostics", async () => {
		const customProfile = createProfile({
			providerType: "custom",
			endpointUrl: "https://example.com",
			modelId: "gpt-4-mini",
			consentTimestamp: 1_700_000_200
		});
		const error = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
		const fetchMock = vi.fn(async () => {
			throw error;
		});
		const harness = createHarness({ profiles: [customProfile], fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 120]);

		const result = await harness.service.testPrompt();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(false);
		expect(result.errorCode).toBe("ECONNREFUSED");
		expect(result.errorMessage).toContain("Unable to connect to https://example.com");
		expect(result.latencyMs).toBeNull();
		expect(result.totalTimeMs).toBe(120);
		expect(harness.diagnostics[0]).toEqual(result);
	});

	it("throws timeout error when request exceeds deadline", async () => {
		vi.useFakeTimers();
		const profile = createProfile();
		const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					reject(new DOMException("Aborted", "AbortError"));
				});
			})
		);
		const harness = createHarness({ profiles: [profile], timeoutMs: 10, fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 11]);

		const promise = harness.service.testPrompt();
		const expectation = expect(promise).rejects.toBeInstanceOf(TestPromptTimeoutError);
		await vi.advanceTimersByTimeAsync(11);
		await expectation;
		expect(harness.diagnostics).toHaveLength(0);
	});

	it("throws when no active profile exists", async () => {
		const inactive = createProfile({ isActive: false });
		const harness = createHarness({ profiles: [inactive] });

		await expect(harness.service.testPrompt()).rejects.toBeInstanceOf(NoActiveProfileError);
	});

	it("generates transcript with user and assistant message pair", async () => {
		const profile = createProfile();
		const harness = createHarness({ profiles: [profile] });
		queuePerformanceTimes([0, 150, 150]);

		const result = await harness.service.testPrompt({ promptText: "Test prompt" });

		expect(result.success).toBe(true);
		expect(result.transcript).toBeDefined();
		expect(result.transcript.messages).toBeDefined();
		expect(result.transcript.messages.length).toBeGreaterThanOrEqual(2);
		
		// Verify user message
		const userMsg = result.transcript.messages.find((m: { role: string }) => m.role === "user");
		expect(userMsg).toBeDefined();
		if (!userMsg) {
			throw new Error("Expected user message in transcript");
		}
		expect(userMsg.text).toBe("Test prompt");
		expect(userMsg.truncated).toBe(false);
		
		// Verify assistant message
		const assistantMsg = result.transcript.messages.find((m: { role: string }) => m.role === "assistant");
		expect(assistantMsg).toBeDefined();
		if (!assistantMsg) {
			throw new Error("Expected assistant message in transcript");
		}
		expect(assistantMsg.text).toBe("Hello world");
		expect(typeof assistantMsg.truncated).toBe("boolean");
	});

	it("sets truncation flag when prompt exceeds 500 characters", async () => {
		const profile = createProfile();
		const longPrompt = "a".repeat(600);
		const harness = createHarness({ profiles: [profile] });
		queuePerformanceTimes([0, 150, 150]);

		const result = await harness.service.testPrompt({ promptText: longPrompt });

		expect(result.success).toBe(true);
		expect(result.transcript.messages).toBeDefined();
		
		const userMsg = result.transcript.messages.find((m: { role: string }) => m.role === "user");
		expect(userMsg).toBeDefined();
		if (!userMsg) {
			throw new Error("Expected user message in transcript");
		}
		expect(userMsg.truncated).toBe(true);
		expect(userMsg.text.length).toBeLessThanOrEqual(500);
	});

	it("sets truncation flag when response exceeds 500 characters", async () => {
		const profile = createProfile();
		const longResponse = "b".repeat(600);
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					model: "llama-2",
					choices: [{ message: { role: "assistant", content: longResponse } }]
				})
			)
		);
		const harness = createHarness({ profiles: [profile], fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 150, 150]);

		const result = await harness.service.testPrompt();

		expect(result.success).toBe(true);
		const assistantMsg = result.transcript.messages.find((m: { role: string }) => m.role === "assistant");
		expect(assistantMsg).toBeDefined();
		if (!assistantMsg) {
			throw new Error("Expected assistant message in transcript");
		}
		expect(assistantMsg.truncated).toBe(true);
		expect(assistantMsg.text.length).toBeLessThanOrEqual(500);
	});

	it("extracts structured assistant content and drops echoed input", async () => {
		const profile = createProfile({ providerType: "custom", endpointUrl: "https://example.com", consentTimestamp: 1_700_000_200 });
		const fetchMock = vi.fn(async () =>
			new Response(
				JSON.stringify({
					model: "gpt-4o",
					choices: [
						{
							message: {
								role: "assistant",
								content: [
									{ type: "input_text", text: "Hello, can you respond?" },
									{ type: "output_text", text: "Yes, I can respond." }
								]
							}
						}
					]
				})
			)
		);
		const harness = createHarness({ profiles: [profile], fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 80, 80]);

		const result = await harness.service.testPrompt();

		expect(result.success).toBe(true);
		expect(result.responseText).toBe("Yes, I can respond.");
		const assistantMsg = result.transcript.messages.find((m: { role: string }) => m.role === "assistant");
		expect(assistantMsg).toBeDefined();
		if (!assistantMsg) {
			throw new Error("Expected assistant message in transcript");
		}
		expect(assistantMsg.text).toBe("Yes, I can respond.");
		const echoedInput = result.transcript.messages.filter((m: { role: string; text: string }) => m.role === "assistant" && m.text.includes("Hello, can you respond?"));
		expect(echoedInput).toHaveLength(0);
	});

	it("maintains rolling history of three exchanges", async () => {
		const profile = createProfile();
		const harness = createHarness({ profiles: [profile] });
		
		// First exchange
		queuePerformanceTimes([0, 100, 100]);
		await harness.service.testPrompt({ promptText: "First" });
		
		// Second exchange
		queuePerformanceTimes([0, 100, 100]);
		await harness.service.testPrompt({ promptText: "Second" });
		
		// Third exchange
		queuePerformanceTimes([0, 100, 100]);
		await harness.service.testPrompt({ promptText: "Third" });
		
		// Fourth exchange should drop the first
		queuePerformanceTimes([0, 100, 100]);
		const result = await harness.service.testPrompt({ promptText: "Fourth" });

		expect(result.transcript.messages.length).toBeLessThanOrEqual(6); // Max 3 exchanges = 6 messages
		
		// Should not contain "First" anymore
		const hasFirst = result.transcript.messages.some((m: { text: string }) => m.text === "First");
		expect(hasFirst).toBe(false);
		
		// Should contain Fourth
		const hasFourth = result.transcript.messages.some((m: { text: string }) => m.text === "Fourth");
		expect(hasFourth).toBe(true);
	});

	it("clears transcript on failure", async () => {
		const customProfile = createProfile({
			id: "33333333-3333-4333-8333-333333333333",
			providerType: "custom",
			endpointUrl: "https://example.com",
			consentTimestamp: 1_700_000_000
		});
		const error = new Error("Connection refused");
		(error as NodeJS.ErrnoException).code = "ECONNREFUSED";
		const fetchMock = vi.fn(async () => {
			throw error;
		});
		const harness = createHarness({ profiles: [customProfile], fetchImplementation: fetchMock });
		queuePerformanceTimes([0, 120]);

		const result = await harness.service.testPrompt();

		expect(result.success).toBe(false);
		expect(result.transcript).toBeDefined();
		expect(result.transcript.status).toBe("error");
		expect(result.transcript.messages).toEqual([]);
		expect(result.transcript.latencyMs).toBeNull();
		expect(result.transcript.errorCode).toBe("ECONNREFUSED");
	});
});
