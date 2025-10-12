import {
	TestPromptResultSchema,
	type LLMProfile,
	type ProfileVault,
	type ProviderType,
	type TestPromptResult,
	type TranscriptMessage
} from "@metaverse-systems/llm-tutor-shared/llm";
import { performance } from "node:perf_hooks";

import { ProfileNotFoundError } from "./profile-vault.js";
import type { ProfileVaultService } from "./profile-vault.js";
import type {
	DecryptionResult,
	EncryptionService
} from "../../infra/encryption/index.js";
import { getTranscriptStore, type TestTranscriptStore } from "./test-transcript.store.js";

const DEFAULT_PROMPT = "Hello, can you respond?" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 500;
const RESPONSE_TRUNCATION_SUFFIX = "..." as const;
const AZURE_API_VERSION = "2024-02-15-preview" as const;

export class NoActiveProfileError extends Error {
	readonly code = "NO_ACTIVE_PROFILE" as const;

	constructor() {
		super("No active LLM profile is available");
		this.name = "NoActiveProfileError";
	}
}

export class TestPromptTimeoutError extends Error {
	readonly code = "TIMEOUT" as const;

	constructor(timeoutMs: number) {
		super(`Test prompt request timed out after ${timeoutMs}ms`);
		this.name = "TestPromptTimeoutError";
	}
}

export interface TestPromptDiagnosticsEvent {
	type: "llm_test_prompt";
	result: TestPromptResult;
}

export interface TestPromptDiagnosticsRecorder {
	record(event: TestPromptDiagnosticsEvent): void | Promise<void>;
}

export interface TestPromptRequest {
	profileId?: string;
	promptText?: string;
}

export interface TestPromptServiceOptions {
	vaultService: ProfileVaultService;
	encryptionService: EncryptionService;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	diagnosticsRecorder?: TestPromptDiagnosticsRecorder | null;
	now?: () => number;
}

interface ProviderRequestConfig {
	url: URL;
	headers: Record<string, string>;
	body: unknown;
}

interface ProviderSuccessPayload {
	responseText: string | null;
	modelName: string | null;
}

interface ProviderErrorPayload {
	errorCode: string;
	errorMessage: string;
}

interface CreateSuccessResultOptions {
	profile: LLMProfile;
	promptText: string;
	latencyMs: number | null;
	totalTimeMs: number;
	timestamp: number;
	payload: ProviderSuccessPayload;
}

interface CreateFailureResultOptions {
	profile: LLMProfile;
	promptText: string;
	latencyMs: number | null;
	totalTimeMs: number;
	timestamp: number;
	error: ProviderErrorPayload;
}

export class TestPromptService {
	private readonly vaultService: ProfileVaultService;
	private readonly encryptionService: EncryptionService;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;
	private readonly diagnosticsRecorder?: TestPromptDiagnosticsRecorder | null;
	private readonly now: () => number;
	private readonly transcriptStore: TestTranscriptStore;

	constructor(options: TestPromptServiceOptions) {
		this.vaultService = options.vaultService;
		this.encryptionService = options.encryptionService;
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.diagnosticsRecorder = options.diagnosticsRecorder ?? null;
		this.now = options.now ?? (() => Date.now());
		this.transcriptStore = getTranscriptStore();
	}

	async testPrompt(request: TestPromptRequest = {}): Promise<TestPromptResult> {
		const promptText = this.normalizePrompt(request.promptText);
		const profile = this.resolveProfile(request.profileId);
		const decrypted = this.decryptApiKey(profile);
		const apiKey = decrypted.value;
		const timestamp = this.now();
		const { url, headers, body } = this.createProviderRequest(profile, promptText, apiKey);

		const startMonotonic = performance.now();
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		let latencyMs: number | null = null;
		let totalTimeMs: number;

		try {
			const response = await this.fetchImpl(url.toString(), {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal
			});
			latencyMs = this.elapsedSince(startMonotonic);
			const rawBody = await response.text();
			totalTimeMs = this.elapsedSince(startMonotonic);

			if (!response.ok) {
				const failure = this.createFailureResult({
					profile,
					promptText,
					latencyMs: null,
					totalTimeMs,
					timestamp,
					error: this.mapHttpError(profile.providerType, response.status, rawBody, url)
				});
				await this.recordDiagnostics(failure);
				return failure;
			}

			const success = this.createSuccessResult({
				profile,
				promptText,
				latencyMs,
				totalTimeMs,
				timestamp,
				payload: this.parseProviderResponse(profile.providerType, rawBody)
			});
			await this.recordDiagnostics(success);
			return success;
		} catch (unknownError: unknown) {
			const totalElapsed = this.elapsedSince(startMonotonic);
			if (isAbortError(unknownError)) {
				throw new TestPromptTimeoutError(this.timeoutMs);
			}

			const failure = this.createFailureResult({
				profile,
				promptText,
				latencyMs,
				totalTimeMs: totalElapsed,
				timestamp,
				error: this.mapNetworkError(unknownError, url)
			});
			await this.recordDiagnostics(failure);
			return failure;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private resolveProfile(profileId?: string): LLMProfile {
		if (profileId) {
			const profile = this.vaultService.getProfile(profileId);
			if (!profile) {
				throw new ProfileNotFoundError(profileId);
			}
			return profile;
		}

		const vault: ProfileVault = this.vaultService.loadVault();
		const activeProfile: LLMProfile | undefined = vault.profiles.find((candidate) => candidate.isActive);
		if (!activeProfile) {
			throw new NoActiveProfileError();
		}
		return activeProfile;
	}

	private decryptApiKey(profile: LLMProfile): DecryptionResult {
		try {
			return this.encryptionService.decrypt(profile.apiKey);
		} catch {
			return { value: profile.apiKey, wasDecrypted: false } as DecryptionResult;
		}
	}

	private createProviderRequest(profile: LLMProfile, promptText: string, apiKey: string): ProviderRequestConfig {
		switch (profile.providerType) {
			case "llama.cpp":
				return this.buildLlamaRequest(profile, promptText);
			case "azure":
				return this.buildAzureRequest(profile, promptText, apiKey);
			case "custom":
			default:
				return this.buildCustomRequest(profile, promptText, apiKey);
		}
	}

	private buildLlamaRequest(profile: LLMProfile, promptText: string): ProviderRequestConfig {
		const url = this.appendPath(profile.endpointUrl, "/v1/chat/completions");
		return {
			url,
			headers: {
				"content-type": "application/json"
			},
			body: {
				messages: [
					{
						role: "system",
						content: "You are a helpful AI assistant."
					},
					{
						role: "user",
						content: promptText
					}
				],
				model: profile.modelId ?? undefined,
				max_tokens: 100,
				temperature: 0.7
			}
		};
	}

	private buildAzureRequest(profile: LLMProfile, promptText: string, apiKey: string): ProviderRequestConfig {
		const base = this.trimTrailingSlash(profile.endpointUrl);
		const url = new URL(`${base}/chat/completions?api-version=${AZURE_API_VERSION}`);
		return {
			url,
			headers: {
				"content-type": "application/json",
				"api-key": apiKey
			},
			body: {
				messages: [
					{
						role: "user",
						content: promptText
					}
				],
				max_tokens: 100,
				temperature: 0.7
			}
		};
	}

	private buildCustomRequest(profile: LLMProfile, promptText: string, apiKey: string): ProviderRequestConfig {
		const baseUrl = this.trimTrailingSlash(profile.endpointUrl);
		const url = new URL(`${baseUrl}/chat/completions`);
		const headers: Record<string, string> = {
			"content-type": "application/json"
		};

		const trimmedKey = apiKey.trim();
		if (trimmedKey.length > 0) {
			headers.Authorization = trimmedKey.startsWith("Bearer ") ? trimmedKey : `Bearer ${trimmedKey}`;
		}

		return {
			url,
			headers,
			body: {
				messages: [
					{
						role: "user",
						content: promptText
					}
				],
				model: profile.modelId ?? undefined,
				max_tokens: 100,
				temperature: 0.7
			}
		};
	}

	private parseProviderResponse(providerType: ProviderType, rawBody: string): ProviderSuccessPayload {
		const parsed = safeJsonParse(rawBody);
		if (!isRecord(parsed)) {
			return { responseText: null, modelName: null };
		}

		const modelName = typeof parsed.model === "string"
			? parsed.model
			: typeof parsed.model_name === "string"
				? parsed.model_name
				: null;

		const structuredOutput = extractOutputText(parsed);
		if (structuredOutput) {
			return { responseText: structuredOutput, modelName };
		}

		const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
		const choice = choices.find((candidate): candidate is Record<string, unknown> => isRecord(candidate)) ?? null;

		if (!choice) {
			return { responseText: null, modelName };
		}

		if (providerType === "llama.cpp") {
			const text = extractChoiceResponse(choice) ?? extractString(choice["text"]);
			return { responseText: text, modelName };
		}

		const responseText = extractChoiceResponse(choice);
		return {
			responseText: responseText ?? extractString(choice.text),
			modelName
		};
	}

	private createSuccessResult(options: CreateSuccessResultOptions): TestPromptResult {
		const { profile, promptText, latencyMs, totalTimeMs, timestamp, payload } = options;
		const latency = latencyMs ?? Math.max(1, Math.round(totalTimeMs));
		const responseText = payload.responseText
			? this.truncateResponse(this.sanitizeResponse(payload.responseText))
			: null;
		const modelName = payload.modelName ?? profile.modelId ?? null;

		// Build transcript messages
		const userMessage = this.createTranscriptMessage(promptText, 'user');
		const assistantMessage = this.createTranscriptMessage(
			payload.responseText ?? '',
			'assistant'
		);
		const messages: TranscriptMessage[] = [userMessage, assistantMessage];

		// Update transcript store with new messages
		this.transcriptStore.update(profile.id, messages, 'success', latency, null, null);

		// Get full transcript from store (includes history)
		const transcript = this.transcriptStore.get(profile.id);

		const result: TestPromptResult = {
			profileId: profile.id,
			profileName: profile.name,
			providerType: profile.providerType,
			success: true,
			promptText,
			responseText,
			modelName,
			latencyMs: latency,
			totalTimeMs: Math.max(1, Math.round(totalTimeMs)),
			errorCode: null,
			errorMessage: null,
			timestamp,
			transcript: transcript!,
		};

		return TestPromptResultSchema.parse(result);
	}

	private createFailureResult(options: CreateFailureResultOptions): TestPromptResult {
		const { profile, promptText, latencyMs, totalTimeMs, timestamp, error } = options;

		// Clear transcript history on failure
		this.transcriptStore.clear(profile.id);

		// Create error transcript with empty messages
		const transcript = {
			messages: [],
			status: error.errorCode === 'TIMEOUT' ? 'timeout' as const : 'error' as const,
			latencyMs: null,
			errorCode: error.errorCode,
			remediation: this.generateRemediation(error.errorCode, profile.providerType),
		};

		// Store the error transcript
		this.transcriptStore.update(
			profile.id,
			[],
			transcript.status,
			null,
			error.errorCode,
			transcript.remediation
		);

		const result: TestPromptResult = {
			profileId: profile.id,
			profileName: profile.name,
			providerType: profile.providerType,
			success: false,
			promptText,
			responseText: null,
			modelName: null,
			latencyMs,
			totalTimeMs: Math.max(1, Math.round(totalTimeMs)),
			errorCode: error.errorCode,
			errorMessage: this.truncateErrorMessage(error.errorMessage),
			timestamp,
			transcript,
		};

		return TestPromptResultSchema.parse(result);
	}

	private createTranscriptMessage(text: string, role: 'user' | 'assistant'): TranscriptMessage {
		const sanitized = role === 'assistant' ? this.sanitizeResponse(text) : text;
		const truncated = sanitized.length > MAX_MESSAGE_LENGTH;
		const truncatedText = truncated
			? sanitized.substring(0, MAX_MESSAGE_LENGTH - RESPONSE_TRUNCATION_SUFFIX.length) + RESPONSE_TRUNCATION_SUFFIX
			: sanitized;

		return {
			role,
			text: truncatedText,
			truncated,
		};
	}

	private generateRemediation(errorCode: string, _providerType: ProviderType): string | null {
		const remediations: Record<string, string> = {
			'ECONNREFUSED': 'Check that the service is running and accessible',
			'TIMEOUT': 'Increase timeout value or check service performance',
			'ENOTFOUND': 'Verify the endpoint URL is correct',
			'401': 'Check your API key is valid',
			'403': 'Verify your API key has the required permissions',
			'429': 'Rate limit exceeded. Wait before retrying',
			'500': 'Service error. Try again later',
			'503': 'Service temporarily unavailable',
		};

		return remediations[errorCode] || 'Check your configuration and try again';
	}

	private sanitizeResponse(value: string): string {
		return value.replace(ANSI_ESCAPE_SEQUENCE_REGEX, "").replace(CONTROL_CHARACTERS_REGEX, "").trim();
	}

	private truncateResponse(value: string): string {
		if (value.length <= MAX_RESPONSE_LENGTH) {
			return value;
		}
		const slice = value.slice(0, MAX_RESPONSE_LENGTH - RESPONSE_TRUNCATION_SUFFIX.length);
		return `${slice}${RESPONSE_TRUNCATION_SUFFIX}`;
	}

	private truncateErrorMessage(value: string): string {
		const sanitized = value.replace(CONTROL_CHARACTERS_REGEX, "").trim();
		return sanitized.length > 1000 ? `${sanitized.slice(0, 997)}...` : sanitized;
	}

	private mapHttpError(
		providerType: ProviderType,
		status: number,
		rawBody: string,
		url: URL
	): ProviderErrorPayload {
		if (providerType === "azure") {
			const details = extractErrorObject(rawBody);
			const errorCode = typeof details.code === "string" ? details.code : String(status);
			const message = mapAzureErrorMessage(errorCode, status, details.message);
			return {
				errorCode,
				errorMessage: message
			};
		}

		if (providerType === "llama.cpp") {
			const details = extractErrorObject(rawBody);
			const errorCode = typeof details.code === "string" ? details.code : String(status);
			const message = mapLlamaErrorMessage(errorCode, url.toString());
			return {
				errorCode,
				errorMessage: message
			};
		}

		const details = extractErrorObject(rawBody);
		const errorCode = typeof details.code === "string" ? details.code : String(status);
		const message =
			typeof details.message === "string"
				? details.message
				: `Request failed with status ${status}`;
		return {
			errorCode,
			errorMessage: message
		};
	}

	private mapNetworkError(error: unknown, url: URL): ProviderErrorPayload {
		const { code, message } = deriveNetworkError(error);
		// Normalize ETIMEDOUT to TIMEOUT for consistency
		const normalizedCode = code === "ETIMEDOUT" ? "TIMEOUT" : code;
		const friendly = mapNetworkErrorMessage(code, url);
		return {
			errorCode: normalizedCode,
			errorMessage: friendly ?? message
		};
	}

	private normalizePrompt(promptText?: string): string {
		if (!promptText) {
			return DEFAULT_PROMPT;
		}
		const trimmed = promptText.trim();
		return trimmed.length > 0 ? trimmed : DEFAULT_PROMPT;
	}

	private appendPath(baseUrl: string, path: string): URL {
		const normalized = this.trimTrailingSlash(baseUrl);
		return new URL(`${normalized}${path}`);
	}

	private trimTrailingSlash(value: string): string {
		return value.replace(/\/+$/, "");
	}

	private elapsedSince(start: number): number {
		return Math.max(1, Math.round(performance.now() - start));
	}

	private async recordDiagnostics(result: TestPromptResult): Promise<void> {
		if (!this.diagnosticsRecorder) {
			return;
		}

		try {
			await Promise.resolve(this.diagnosticsRecorder.record({ type: "llm_test_prompt", result }));
		} catch (error) {
			console.warn("Failed to record test prompt diagnostics event", error);
		}
	}
}

function extractString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractOutputText(payload: Record<string, unknown>): string | null {
	const direct = extractMessageContent(payload["output_text"]);
	if (direct) {
		return direct;
	}

	const outputItems = Array.isArray(payload["output"]) ? payload["output"] : null;
	if (!outputItems) {
		return null;
	}

	const parts: string[] = [];
	for (const item of outputItems) {
		if (!isRecord(item)) {
			continue;
		}
		const content = extractMessageContent(item.content);
		if (content) {
			parts.push(content);
		}
	}

	if (parts.length === 0) {
		return null;
	}

	return parts.join("\n\n");
}

function extractChoiceResponse(choice: Record<string, unknown>): string | null {
	const message = isRecord(choice["message"]) ? choice["message"] : null;
	if (message) {
		const content = extractMessageContent(message.content);
		if (content) {
			return content;
		}
	}

	const delta = isRecord(choice["delta"]) ? choice["delta"] : null;
	if (delta) {
		const content = extractMessageContent(delta.content);
		if (content) {
			return content;
		}
	}

	return extractMessageContent(choice["text"]);
}

function extractMessageContent(value: unknown): string | null {
	if (typeof value === "string") {
		return extractString(value);
	}

	if (Array.isArray(value)) {
		const parts: string[] = [];
		for (const item of value) {
			const part = extractMessageContent(item);
			if (part) {
				parts.push(part);
			}
		}
		if (parts.length > 0) {
			return parts.join("\n\n");
		}
		return null;
	}

	if (!isRecord(value)) {
		return null;
	}

	const typeValue = value["type"];
	const rawType = typeof typeValue === "string" ? typeValue.toLowerCase() : null;
	if (rawType === "input_text") {
		return null;
	}

	const textCandidate =
		extractString(value["text"]) ??
		extractString(value["value"]) ??
		extractString(value["content"]);
	if (textCandidate) {
		return textCandidate;
	}

	const contentField = "content" in value ? value["content"] : null;
	if (contentField && contentField !== value) {
		const nested = extractMessageContent(contentField);
		if (nested) {
			return nested;
		}
	}

	const valueField = "value" in value ? value["value"] : null;
	if (valueField && valueField !== value) {
		const nested = extractMessageContent(valueField);
		if (nested) {
			return nested;
		}
	}

	return null;
}

function extractErrorObject(rawBody: string): { code?: unknown; message?: unknown } {
	const parsed = safeJsonParse(rawBody);
	if (!isRecord(parsed)) {
		return {};
	}

	if (isRecord(parsed.error)) {
		return {
			code: parsed.error.code,
			message: parsed.error.message
		};
	}

	return {
		code: parsed.code,
		message: parsed.message
	};
}

function mapAzureErrorMessage(code: string, status: number, message: unknown): string {
	const normalizedCode = code.toUpperCase();
	const messageStr = typeof message === "string" && message.trim().length > 0 ? message : null;
	
	switch (normalizedCode) {
		case "401":
			// Use original message if it contains "subscription key" or "credential", otherwise use default
			if (messageStr && (messageStr.toLowerCase().includes("subscription key") || 
			                   messageStr.toLowerCase().includes("credential"))) {
				return messageStr;
			}
			return "Invalid API key. Check your credentials.";
		case "DEPLOYMENTNOTFOUND":
			return "Model deployment not found. Verify deployment name.";
		case "429":
			return "Rate limit exceeded. Try again in a few minutes.";
		case "INTERNALSERVERERROR":
			return "Azure service error. Check Azure status page.";
		case "503":
			return "Service temporarily unavailable. Retry later.";
		default:
			if (messageStr) {
				return messageStr;
			}
			return `Azure OpenAI request failed with status ${status}`;
	}
}

function mapLlamaErrorMessage(code: string, endpoint: string): string {
	switch (code) {
		case "invalid_request":
			return "Invalid request format. Check prompt syntax.";
		case "server_error":
			return "llama.cpp server error. Check server logs.";
		default:
			return `Request to ${endpoint} failed with status ${code}`;
	}
}

function deriveNetworkError(error: unknown): { code: string; message: string } {
	if (isRecord(error) && typeof error.code === "string" && error.code.trim().length > 0) {
		const codeValue = error.code;
		const detailsMessage = typeof error.message === "string" ? error.message : null;
		if (codeValue.trim().length > 0) {
			return {
				code: codeValue,
				message: detailsMessage && detailsMessage.trim().length > 0 ? detailsMessage : codeValue
			};
		}
	}

	if (error instanceof Error && error.cause && isRecord(error.cause)) {
		const cause = error.cause;
		const causeCode = typeof cause.code === "string" ? cause.code : null;
		if (causeCode && causeCode.trim().length > 0) {
			const causeMessage = typeof cause.message === "string" ? cause.message : null;
			return {
				code: causeCode,
				message: causeMessage && causeMessage.trim().length > 0 ? causeMessage : causeCode
			};
		}
	}

	return {
		code: "NETWORK_ERROR",
		message: error instanceof Error ? error.message : "Network request failed"
	};
}

function mapNetworkErrorMessage(code: string, url: URL): string | null {
	switch (code) {
		case "ECONNREFUSED":
			return `Unable to connect to ${url.origin}. Is the server running?`;
		case "ETIMEDOUT":
			return "Request timed out after 10 seconds. Server may be slow.";
		case "ENOTFOUND":
			return `Could not resolve hostname ${url.hostname}. Check the URL.`;
		case "ECONNRESET":
			return "Connection reset by server. Check server logs.";
		default:
			return null;
	}
}

function isAbortError(error: unknown): boolean {
	if (typeof DOMException !== "undefined" && error instanceof DOMException) {
		return error.name === "AbortError";
	}
	return error instanceof Error && error.name === "AbortError";
}

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const ANSI_ESCAPE_SEQUENCE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g; // eslint-disable-line no-control-regex
const CONTROL_CHARACTERS_REGEX = /[\u0000-\u0008\u000B-\u001F\u007F]/g; // eslint-disable-line no-control-regex
