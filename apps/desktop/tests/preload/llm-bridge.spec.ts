import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmRendererBridge } from "../../src/preload/llm-bridge";

const exposedApis = new Map<string, unknown>();

vi.mock("electron", () => {
	const invoke = vi.fn((_channel: string, _payload?: unknown) => Promise.resolve(undefined));
	return {
		contextBridge: {
			exposeInMainWorld: vi.fn((key: string, api: unknown) => {
				exposedApis.set(key, api);
			})
		},
		ipcRenderer: {
			invoke
		}
	};
});

describe("llm preload bridge", () => {
	beforeEach(() => {
		exposedApis.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("exposes the LLM API on window", async () => {
		const { contextBridge } = (await import("electron")) as unknown as {
			contextBridge: {
				exposeInMainWorld: ReturnType<typeof vi.fn>;
			};
		};

		const { LLM_BRIDGE_KEY } = await import("../../src/preload/llm-bridge");

		expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
		const calls = contextBridge.exposeInMainWorld.mock.calls as [string, unknown][];
		expect(calls.length).toBeGreaterThan(0);
		const [keyArg, apiArg] = calls[0];
		expect(keyArg).toBe(LLM_BRIDGE_KEY);
		if (!apiArg || typeof apiArg !== "object") {
			throw new Error("LLM bridge was not registered as an object");
		}
		const registered = apiArg as LlmRendererBridge;
		expect(typeof registered.listProfiles).toBe("function");
		expect(typeof registered.createProfile).toBe("function");
		expect(typeof registered.updateProfile).toBe("function");
		expect(typeof registered.deleteProfile).toBe("function");
		expect(typeof registered.activateProfile).toBe("function");
		expect(typeof registered.testPrompt).toBe("function");
		expect(typeof registered.discoverProfiles).toBe("function");

		const exposed = exposedApis.get(LLM_BRIDGE_KEY) as LlmRendererBridge | undefined;
		expect(exposed).toBeDefined();
		if (exposed) {
			expect(typeof exposed.listProfiles).toBe("function");
			expect(typeof exposed.createProfile).toBe("function");
			expect(typeof exposed.updateProfile).toBe("function");
			expect(typeof exposed.deleteProfile).toBe("function");
			expect(typeof exposed.activateProfile).toBe("function");
			expect(typeof exposed.testPrompt).toBe("function");
			expect(typeof exposed.discoverProfiles).toBe("function");
		}
	});

	it("delegates bridge calls to the expected IPC channels", async () => {
		const { ipcRenderer } = (await import("electron")) as unknown as {
			ipcRenderer: {
				invoke: ReturnType<typeof vi.fn>;
			};
		};

		const {
			LLM_IPC_CHANNELS,
			createLlmBridge
		} = await import("../../src/preload/llm-bridge");

		const bridge = createLlmBridge();

		await bridge.listProfiles();

		await bridge.createProfile({
			name: "Azure Prod",
			providerType: "azure",
			endpointUrl: "https://example.openai.azure.com",
			apiKey: "sk-test",
			modelId: "gpt-4",
			consentTimestamp: Date.now()
		});

		await bridge.updateProfile({
			id: "00000000-0000-4000-8000-000000000001",
			name: "Azure Staging"
		});

		await bridge.deleteProfile({
			id: "00000000-0000-4000-8000-000000000001"
		});

		await bridge.activateProfile({
			id: "00000000-0000-4000-8000-000000000001"
		});

		await bridge.testPrompt({
			profileId: "00000000-0000-4000-8000-000000000001",
			promptText: "Hello"
		});

		await bridge.testPrompt();

		await bridge.discoverProfiles();
		await bridge.discoverProfiles({ force: true });
		await bridge.discoverProfiles({ force: false });

		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, LLM_IPC_CHANNELS.list);
		const [, createPayload] = ipcRenderer.invoke.mock.calls[1] as [string, Record<string, unknown>];
		expect(ipcRenderer.invoke.mock.calls[1][0]).toBe(LLM_IPC_CHANNELS.create);
		expect(createPayload).toMatchObject({
			name: "Azure Prod",
			providerType: "azure",
			endpointUrl: "https://example.openai.azure.com",
			apiKey: "sk-test",
			modelId: "gpt-4"
		});
		expect(typeof createPayload.consentTimestamp).toBe("number");
		expect(Number.isFinite(createPayload.consentTimestamp)).toBe(true);
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, LLM_IPC_CHANNELS.update, {
			id: "00000000-0000-4000-8000-000000000001",
			name: "Azure Staging"
		});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, LLM_IPC_CHANNELS.delete, {
			id: "00000000-0000-4000-8000-000000000001"
		});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, LLM_IPC_CHANNELS.activate, {
			id: "00000000-0000-4000-8000-000000000001"
		});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(6, LLM_IPC_CHANNELS.testPrompt, {
			profileId: "00000000-0000-4000-8000-000000000001",
			promptText: "Hello"
		});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(7, LLM_IPC_CHANNELS.testPrompt, {});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(8, LLM_IPC_CHANNELS.discover, {});
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(9, LLM_IPC_CHANNELS.discover, { force: true });
		expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(10, LLM_IPC_CHANNELS.discover, {});
	});
});
