import { URL } from "node:url";
import type { LlmProbeResult } from "./snapshot.service.js";

export interface LlmProbeOptions {
	endpoint?: string | null;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 1_500;

function sanitizeEndpoint(endpoint: string): string | null {
	const trimmed = endpoint.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function createLlmProbe(options: LlmProbeOptions = {}): () => Promise<LlmProbeResult> {
	const endpoint = options.endpoint ? sanitizeEndpoint(options.endpoint) : null;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? fetch;

	if (!endpoint) {
		return async () => ({
			status: "disabled"
		});
	}

	return async () => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		timeout.unref?.();

		try {
			const target = new URL("/health", endpoint);
			const response = await fetchImpl(target, {
				method: "GET",
				signal: controller.signal
			});

			if (response.ok) {
				return {
					status: "connected",
					endpoint
				};
			}

			return {
				status: "unreachable",
				endpoint,
				warnings: [`llama.cpp responded with status ${response.status}`]
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				status: "unreachable",
				endpoint,
				warnings: [`llama.cpp unreachable: ${message}`]
			};
		} finally {
			clearTimeout(timeout);
		}
	};
}
