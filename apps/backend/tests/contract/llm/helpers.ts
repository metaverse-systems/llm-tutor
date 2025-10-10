import { z } from "zod";
import { ProfileVaultSchema } from "@metaverse-systems/llm-tutor-shared/llm";

export type ProfileVaultSeed = z.input<typeof ProfileVaultSchema>;

export interface LlmContractTestHarness {
	invoke(channel: string, payload?: unknown): Promise<unknown>;
	seedVault(seed: ProfileVaultSeed): Promise<void>;
	clearVault(): Promise<void>;
	simulateVaultReadError(error?: Error): Promise<void>;
	simulateVaultWriteError(error?: Error): Promise<void>;
	close(): Promise<void>;
}

interface LlmApiModule {
	createLLMContractTestHarness?: (options?: {
		initialVault?: ProfileVaultSeed | null;
	}) => Promise<LlmContractTestHarness>;
}

class NotImplementedHarness implements LlmContractTestHarness {
	async invoke(channel: string): Promise<never> {
		throw new Error(`${channel} handler not implemented`);
	}

	async seedVault(): Promise<void> {}

	async clearVault(): Promise<void> {}

	async simulateVaultReadError(): Promise<void> {}

	async simulateVaultWriteError(): Promise<void> {}

	async close(): Promise<void> {}
}

function assertHarness(value: unknown): asserts value is LlmContractTestHarness {
	if (!value || typeof value !== "object") {
		throw new Error("LLM contract test harness must be an object");
	}

	const candidate = value as Record<string, unknown>;
	const requiredMethods: Array<keyof LlmContractTestHarness> = [
		"invoke",
		"seedVault",
		"clearVault",
		"simulateVaultReadError",
		"simulateVaultWriteError",
		"close"
	];

	const missing = requiredMethods.find((method) => typeof candidate[method] !== "function");
	if (missing) {
		throw new Error(`LLM contract test harness must implement ${missing}()`);
	}
}

export async function loadLlmContractTestHarness(
	options: { initialVault?: ProfileVaultSeed | null } = {}
): Promise<LlmContractTestHarness> {
	const moduleParts = ["..", "..", "..", "src", "api", "llm", "index.js"] as const;
	const moduleSpecifier = moduleParts.join("/");

	let module: LlmApiModule | null = null;

	try {
		module = (await import(moduleSpecifier)) as LlmApiModule;
	} catch (error) {
		return new NotImplementedHarness();
	}

	const factory = module?.createLLMContractTestHarness;
	if (typeof factory !== "function") {
		return new NotImplementedHarness();
	}

	const harness = await factory(options);
	assertHarness(harness);
	return harness;
}
