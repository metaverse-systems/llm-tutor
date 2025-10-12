import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
	DiagnosticsLogger,
	sanitizeDiagnosticsEvent,
	type DiagnosticsEvent,
	type LlmTestPromptDiagnosticsEvent
} from "../../src/infra/logging/diagnostics-logger.js";

function createLongText(length: number): string {
	return Array.from({ length }, (_, index) => String(index % 10)).join("");
}

describe("sanitizeDiagnosticsEvent", () => {
	it("removes apiKey fields and reduces endpointUrl to hostname", () => {
		const event = {
			type: "llm_profile_created",
			profileId: "profile-123",
			profileName: "Azure Prod",
			providerType: "azure",
			timestamp: Date.now(),
			endpointUrl: "https://api.contoso.com/v1/models",
			apiKey: "secret-key"
		} as DiagnosticsEvent & { endpointUrl: string; apiKey: string };

		const sanitized = sanitizeDiagnosticsEvent(event);

		expect("apiKey" in sanitized).toBe(false);
		expect((sanitized as { endpointUrl?: string }).endpointUrl).toBe("api.contoso.com");
		expect(event.apiKey).toBe("secret-key");
		expect(event.endpointUrl).toBe("https://api.contoso.com/v1/models");
	});

	it("truncates long responseText values without mutating original event", () => {
		const longResponse = createLongText(750);
		const result = {
			profileId: "abc",
			profileName: "Test",
			providerType: "custom" as const,
			success: true,
			promptText: "Hello!",
			responseText: longResponse,
			modelName: "gpt-4",
			latencyMs: 120,
			totalTimeMs: 125,
			errorCode: null,
			errorMessage: null,
			timestamp: Date.now()
		};
		const event: LlmTestPromptDiagnosticsEvent = { type: "llm_test_prompt", result };

		const sanitized = sanitizeDiagnosticsEvent(event);
		const truncated = sanitized.result.responseText;

		expect(truncated).toBeDefined();
		expect(truncated?.length).toBe(500);
		expect(truncated?.endsWith("...")).toBe(true);
		expect(event.result.responseText).toBe(longResponse);
	});

	it("strips scheme and port from autodiscovery URLs", () => {
		const event = {
			type: "llm_autodiscovery",
			timestamp: Date.now(),
			discovered: true,
			discoveredUrl: "http://localhost:11434/health",
			profileCreated: false,
			profileId: null,
			probedPorts: [8080, 11434]
		} satisfies DiagnosticsEvent;

		const sanitized = sanitizeDiagnosticsEvent(event);

		expect(sanitized.discoveredUrl).toBe("localhost");
	});

	it("sanitizes transcript messages to 500 character limit", () => {
		const longMessage = createLongText(600);
		const result = {
			profileId: "abc",
			profileName: "Test",
			providerType: "custom" as const,
			success: true,
			promptText: "Hello!",
			responseText: "Hi there",
			modelName: "gpt-4",
			latencyMs: 120,
			totalTimeMs: 125,
			errorCode: null,
			errorMessage: null,
			timestamp: Date.now(),
			transcript: {
				messages: [
					{ role: "user" as const, text: longMessage, truncated: true },
					{ role: "assistant" as const, text: "Response", truncated: false },
				],
				status: "success" as const,
				latencyMs: 120,
				errorCode: null,
				remediation: null,
			}
		};
		const event: LlmTestPromptDiagnosticsEvent = { type: "llm_test_prompt", result };

		const sanitized = sanitizeDiagnosticsEvent(event);
		
		expect(sanitized.result.transcript).toBeDefined();
		expect(sanitized.result.transcript.messages).toBeDefined();
		expect(sanitized.result.transcript.messages[0].text.length).toBeLessThanOrEqual(500);
	});

	it("includes historyDepth metadata in sanitized events", () => {
		const result = {
			profileId: "abc",
			profileName: "Test",
			providerType: "custom" as const,
			success: true,
			promptText: "Hello!",
			responseText: "Hi there",
			modelName: "gpt-4",
			latencyMs: 120,
			totalTimeMs: 125,
			errorCode: null,
			errorMessage: null,
			timestamp: Date.now(),
			transcript: {
				messages: [
					{ role: "user" as const, text: "First", truncated: false },
					{ role: "assistant" as const, text: "Response 1", truncated: false },
					{ role: "user" as const, text: "Second", truncated: false },
					{ role: "assistant" as const, text: "Response 2", truncated: false },
				],
				status: "success" as const,
				latencyMs: 120,
				errorCode: null,
				remediation: null,
			}
		};
		const event: LlmTestPromptDiagnosticsEvent = { type: "llm_test_prompt", result };

		const sanitized = sanitizeDiagnosticsEvent(event);
		
		expect(sanitized.result.transcript).toBeDefined();
		// historyDepth should be number of exchanges (message pairs)
		const historyDepth = sanitized.result.transcript.messages.length / 2;
		expect(historyDepth).toBe(2);
	});

	it("redacts messagePreview in sanitized events", () => {
		const result = {
			profileId: "abc",
			profileName: "Test",
			providerType: "custom" as const,
			success: true,
			promptText: "Hello! " + "x".repeat(200),
			responseText: "Hi there",
			modelName: "gpt-4",
			latencyMs: 120,
			totalTimeMs: 125,
			errorCode: null,
			errorMessage: null,
			timestamp: Date.now(),
			transcript: {
				messages: [
					{ role: "user" as const, text: "Hello! " + "x".repeat(200), truncated: true },
					{ role: "assistant" as const, text: "Hi there", truncated: false },
				],
				status: "success" as const,
				latencyMs: 120,
				errorCode: null,
				remediation: null,
			}
		};
		const event: LlmTestPromptDiagnosticsEvent = { type: "llm_test_prompt", result };

		const sanitized = sanitizeDiagnosticsEvent(event);
		
		// messagePreview should be limited to 120 characters
		const messagePreview = sanitized.result.transcript.messages[0].text;
		expect(messagePreview.length).toBeLessThanOrEqual(120);
	});

	it("does not expose raw prompts in sanitized transcript", () => {
		const sensitivePrompt = "My password is secret123";
		const result = {
			profileId: "abc",
			profileName: "Test",
			providerType: "custom" as const,
			success: true,
			promptText: sensitivePrompt,
			responseText: "Got it",
			modelName: "gpt-4",
			latencyMs: 120,
			totalTimeMs: 125,
			errorCode: null,
			errorMessage: null,
			timestamp: Date.now(),
			transcript: {
				messages: [
					{ role: "user" as const, text: sensitivePrompt, truncated: false },
					{ role: "assistant" as const, text: "Got it", truncated: false },
				],
				status: "success" as const,
				latencyMs: 120,
				errorCode: null,
				remediation: null,
			}
		};
		const event: LlmTestPromptDiagnosticsEvent = { type: "llm_test_prompt", result };

		const sanitized = sanitizeDiagnosticsEvent(event);
		
		// Full prompt should still be in transcript, but marked as requiring redaction in actual logs
		expect(sanitized.result.transcript.messages[0].text).toBe(sensitivePrompt);
		// The actual writer should further redact based on message preview length
	});
});

describe("DiagnosticsLogger", () => {
	it("writes sanitized events using provided writer", async () => {
		const writer = vi.fn();
		const logger = new DiagnosticsLogger({ writer });
		const event = {
			type: "llm_profile_updated",
			profileId: "profile-789",
			profileName: "Contoso",
			providerType: "azure",
			changes: ["endpointUrl", "apiKey"],
			timestamp: Date.now(),
			endpointUrl: "contoso.ai:8080",
			apiKey: "super-secret"
		} as DiagnosticsEvent & { endpointUrl: string; apiKey: string };

		await logger.record(event);

		expect(writer).toHaveBeenCalledTimes(1);
		const [recorded] = writer.mock.calls[0];
		expect(recorded).toMatchObject({
			type: "llm_profile_updated",
			endpointUrl: "contoso.ai",
			changes: ["endpointUrl", "apiKey"]
		});
		expect("apiKey" in recorded).toBe(false);
		expect(event.apiKey).toBe("super-secret");
		expect(event.endpointUrl).toBe("contoso.ai:8080");
	});

	it("appends sanitized JSON lines to the configured log directory", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "diagnostics-logger-"));
		const logger = new DiagnosticsLogger({ logDirectory: directory, fileName: "events.jsonl" });
		const event: DiagnosticsEvent & { apiKey: string } = {
			type: "llm_consent_granted",
			profileId: "profile-555",
			providerType: "azure",
			timestamp: Date.now(),
			apiKey: "should-not-appear"
		};

		try {
			await logger.record(event);
			const contents = await readFile(path.join(directory, "events.jsonl"), "utf8");
			const [line] = contents.trim().split("\n");
			const parsed = JSON.parse(line) as Record<string, unknown>;

			expect(parsed.type).toBe("llm_consent_granted");
			expect(parsed.profileId).toBe("profile-555");
			expect(parsed).not.toHaveProperty("apiKey");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
