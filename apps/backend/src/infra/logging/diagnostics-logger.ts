import type {
	ProviderType,
	TestPromptResult
} from "@metaverse-systems/llm-tutor-shared/llm";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import type { EncryptionFallbackEvent } from "../encryption/index.js";

const DEFAULT_FILE_NAME = "diagnostics-events.jsonl" as const;
export const DIAGNOSTICS_EVENTS_FILE_NAME = DEFAULT_FILE_NAME;
const DIRECTORY_MODE = 0o700;
const MAX_RESPONSE_LENGTH = 500;
const RESPONSE_TRUNCATION_SUFFIX = "..." as const;

const HOSTNAME_KEYS = new Set(["endpointUrl", "discoveredUrl"]);
const OMITTED_KEYS = new Set(["apiKey"]);
const TRUNCATED_KEYS = new Set(["responseText"]);
const MAX_TRANSCRIPT_MESSAGE_LENGTH = 500;
const MAX_MESSAGE_PREVIEW_LENGTH = 120;

export interface LlmProfileCreatedDiagnosticsEvent {
	type: "llm_profile_created";
	profileId: string;
	profileName: string;
	providerType: ProviderType;
	timestamp: number;
}

export interface LlmProfileUpdatedDiagnosticsEvent {
	type: "llm_profile_updated";
	profileId: string;
	profileName: string;
	providerType: ProviderType;
	changes: string[];
	timestamp: number;
}

export interface LlmProfileDeletedDiagnosticsEvent {
	type: "llm_profile_deleted";
	profileId: string;
	profileName: string;
	providerType: ProviderType;
	timestamp: number;
}

export interface LlmProfileActivatedDiagnosticsEvent {
	type: "llm_profile_activated";
	profileId: string;
	profileName: string;
	providerType: ProviderType;
	timestamp: number;
}

export interface LlmTestPromptDiagnosticsEvent {
	type: "llm_test_prompt";
	result: TestPromptResult;
}

export interface LlmConsentGrantedDiagnosticsEvent {
	type: "llm_consent_granted";
	profileId: string;
	providerType: ProviderType;
	timestamp: number;
}

export interface LlmConsentDeniedDiagnosticsEvent {
	type: "llm_consent_denied";
	profileId: string;
	providerType: ProviderType;
	timestamp: number;
}

export interface LlmAutoDiscoveryDiagnosticsEvent {
	type: "llm_autodiscovery";
	timestamp: number;
	discovered: boolean;
	discoveredUrl: string | null;
	profileCreated: boolean;
	profileId: string | null;
	probedPorts: number[];
	force?: boolean;
	durationMs?: number;
	error?: {
		name: string;
		message: string;
	};
}

export interface TelemetryPreferenceChangedDiagnosticsEvent {
	type: "telemetry_preference_changed";
	enabled: boolean;
	consentTimestamp?: number;
	timestamp: number;
}

export type DiagnosticsEvent =
	| LlmProfileCreatedDiagnosticsEvent
	| LlmProfileUpdatedDiagnosticsEvent
	| LlmProfileDeletedDiagnosticsEvent
	| LlmProfileActivatedDiagnosticsEvent
	| LlmTestPromptDiagnosticsEvent
	| LlmConsentGrantedDiagnosticsEvent
	| LlmConsentDeniedDiagnosticsEvent
	| LlmAutoDiscoveryDiagnosticsEvent
	| TelemetryPreferenceChangedDiagnosticsEvent
	| EncryptionFallbackEvent;

export type SanitizedDiagnosticsEvent = DiagnosticsEvent;

export type DiagnosticsLogWriter = (event: SanitizedDiagnosticsEvent) => Promise<void> | void;

export interface DiagnosticsLoggerOptions {
	writer?: DiagnosticsLogWriter;
	logDirectory?: string;
	fileName?: string;
}

export class DiagnosticsLogger {
	private readonly write: DiagnosticsLogWriter;
	private readonly filePath?: string;
	private readonly directory?: string;
	private ensuredDirectory = false;

	constructor(options: DiagnosticsLoggerOptions) {
		if (!options.writer && !options.logDirectory) {
			throw new TypeError("DiagnosticsLogger requires either a writer or logDirectory");
		}

		if (options.writer) {
			this.write = options.writer;
		} else {
			const directory = options.logDirectory!;
			const fileName = options.fileName ?? DEFAULT_FILE_NAME;
			this.directory = directory;
			this.filePath = path.join(directory, fileName);
			this.write = async (event) => {
				await this.ensureDirectory();
				const serialized = JSON.stringify(event);
				await appendFile(this.filePath!, `${serialized}\n`, "utf-8");
			};
		}
	}

	async record(event: DiagnosticsEvent): Promise<void> {
		const sanitized = sanitizeDiagnosticsEvent(event);
		await this.write(sanitized);
	}

	private async ensureDirectory(): Promise<void> {
		if (this.ensuredDirectory || !this.directory) {
			return;
		}

		await mkdir(this.directory, { recursive: true, mode: DIRECTORY_MODE });
		this.ensuredDirectory = true;
	}
}

export function createDiagnosticsLogger(options: DiagnosticsLoggerOptions): DiagnosticsLogger {
	return new DiagnosticsLogger(options);
}

export function sanitizeDiagnosticsEvent<T extends DiagnosticsEvent>(event: T): T {
	const sanitized = deepCloneAndSanitize(event);
	return sanitized as T;
}

function deepCloneAndSanitize(
	value: unknown,
	currentKey?: string,
	seen = new WeakMap<object, unknown>()
): unknown {
	if (value === null || typeof value !== "object") {
		if (typeof value === "string" && currentKey && TRUNCATED_KEYS.has(currentKey)) {
			return truncateResponseText(value);
		}
		// Handle transcript message text truncation
		if (typeof value === "string" && currentKey === "text") {
			return truncateTranscriptMessage(value);
		}
		return value;
	}

	if (value instanceof Date) {
		return new Date(value.getTime());
	}

	if (seen.has(value)) {
		return seen.get(value)!;
	}

	if (Array.isArray(value)) {
		const result: unknown[] = [];
		seen.set(value, result);
		// Special handling for transcript messages array
		if (currentKey === "messages") {
			for (const entry of value) {
				result.push(deepCloneAndSanitize(entry, "message", seen));
			}
		} else {
			for (const entry of value) {
				result.push(deepCloneAndSanitize(entry, undefined, seen));
			}
		}
		return result;
	}

	const result: Record<string, unknown> = {};
	seen.set(value, result);

	for (const [key, innerValue] of Object.entries(value as Record<string, unknown>)) {
		if (OMITTED_KEYS.has(key)) {
			continue;
		}

		if (HOSTNAME_KEYS.has(key) && typeof innerValue === "string") {
			result[key] = extractHostname(innerValue);
			continue;
		}

		if (TRUNCATED_KEYS.has(key) && typeof innerValue === "string") {
			result[key] = truncateResponseText(innerValue);
			continue;
		}

		result[key] = deepCloneAndSanitize(innerValue, key, seen);
	}

	return result;
}

function extractHostname(candidate: string): string {
	const trimmed = candidate.trim();
	if (trimmed.length === 0) {
		return trimmed;
	}

	const attempts = [trimmed];
	if (!/^\w+:\/\//u.test(trimmed)) {
		attempts.push(`https://${trimmed}`);
	}

	for (const attempt of attempts) {
		try {
			const url = new URL(attempt);
			if (url.hostname) {
				return url.hostname;
			}
		} catch {
			continue;
		}
	}

	const withoutScheme = trimmed.replace(/^\w+:\/\//u, "");
	const host = withoutScheme.split(/[/?#]/u)[0];
	return host.replace(/:\d+$/u, "");
}

function truncateResponseText(value: string): string {
	if (value.length <= MAX_RESPONSE_LENGTH) {
		return value;
	}

	const sliceLength = Math.max(0, MAX_RESPONSE_LENGTH - RESPONSE_TRUNCATION_SUFFIX.length);
	return `${value.slice(0, sliceLength)}${RESPONSE_TRUNCATION_SUFFIX}`;
}

function truncateTranscriptMessage(value: string): string {
	// For transcript messages within diagnostics, limit to MAX_MESSAGE_PREVIEW_LENGTH (120 chars)
	if (value.length <= MAX_MESSAGE_PREVIEW_LENGTH) {
		return value;
	}

	const sliceLength = Math.max(0, MAX_MESSAGE_PREVIEW_LENGTH - RESPONSE_TRUNCATION_SUFFIX.length);
	return `${value.slice(0, sliceLength)}${RESPONSE_TRUNCATION_SUFFIX}`;
}

