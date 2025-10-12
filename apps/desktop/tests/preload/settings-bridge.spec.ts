import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("settings preload bridge", () => {
	beforeEach(() => {
		exposedApis.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("exposes the settings namespace on window.llmTutor", async () => {
		const { contextBridge } = (await import("electron")) as unknown as {
			contextBridge: {
				exposeInMainWorld: ReturnType<typeof vi.fn>;
			};
		};

		// Import the bridge which should expose the API
		await import("../../src/preload/llm-bridge");

		expect(contextBridge.exposeInMainWorld).toHaveBeenCalled();
		
		// Find the llmTutor key
		const calls = contextBridge.exposeInMainWorld.mock.calls as [string, unknown][];
		const llmTutorCall = calls.find(([key]) => key === "llmTutor");
		
		expect(llmTutorCall).toBeDefined();
		
		if (llmTutorCall) {
			const [, apiArg] = llmTutorCall;
			if (!apiArg || typeof apiArg !== "object") {
				throw new Error("llmTutor bridge was not registered as an object");
			}
			
			const registered = apiArg as { settings?: unknown };
			expect(registered.settings).toBeDefined();
			expect(typeof registered.settings).toBe("object");
		}
	});

	it("settings namespace has navigateToSettings method", async () => {
		// Import the bridge
		await import("../../src/preload/llm-bridge");

		const exposed = exposedApis.get("llmTutor") as { settings?: { navigateToSettings?: unknown } } | undefined;
		expect(exposed).toBeDefined();
		expect(exposed?.settings).toBeDefined();
		expect(typeof exposed?.settings?.navigateToSettings).toBe("function");
	});

	it("settings namespace has telemetry.getState method", async () => {
		// Import the bridge
		await import("../../src/preload/llm-bridge");

		const exposed = exposedApis.get("llmTutor") as { 
			settings?: { 
				telemetry?: { 
					getState?: unknown 
				} 
			} 
		} | undefined;
		
		expect(exposed).toBeDefined();
		expect(exposed?.settings).toBeDefined();
		expect(exposed?.settings?.telemetry).toBeDefined();
		expect(typeof exposed?.settings?.telemetry?.getState).toBe("function");
	});

	it("settings namespace has telemetry.setState method", async () => {
		// Import the bridge
		await import("../../src/preload/llm-bridge");

		const exposed = exposedApis.get("llmTutor") as { 
			settings?: { 
				telemetry?: { 
					setState?: unknown 
				} 
			} 
		} | undefined;
		
		expect(exposed).toBeDefined();
		expect(exposed?.settings).toBeDefined();
		expect(exposed?.settings?.telemetry).toBeDefined();
		expect(typeof exposed?.settings?.telemetry?.setState).toBe("function");
	});

	it("telemetry.getState returns default opt-out state", async () => {
		const { ipcRenderer } = (await import("electron")) as unknown as {
			ipcRenderer: {
				invoke: ReturnType<typeof vi.fn>;
			};
		};

		// Mock the response to return default opt-out
		ipcRenderer.invoke.mockResolvedValue({ enabled: false });

		// Import the bridge
		await import("../../src/preload/llm-bridge");

		const exposed = exposedApis.get("llmTutor") as { 
			settings?: { 
				telemetry?: { 
					getState?: () => Promise<{ enabled: boolean; consentTimestamp?: number }> 
				} 
			} 
		} | undefined;
		
		expect(exposed?.settings?.telemetry?.getState).toBeDefined();
		
		if (exposed?.settings?.telemetry?.getState) {
			const state = await exposed.settings.telemetry.getState();
			expect(state.enabled).toBe(false);
			expect(state.consentTimestamp).toBeUndefined();
		}
	});

	it("telemetry.setState records consent timestamp when enabling", async () => {
		const { ipcRenderer } = (await import("electron")) as unknown as {
			ipcRenderer: {
				invoke: ReturnType<typeof vi.fn>;
			};
		};

		const now = Date.now();
		// Mock the response to include consent timestamp
		ipcRenderer.invoke.mockResolvedValue({ enabled: true, consentTimestamp: now });

		// Import the bridge
		await import("../../src/preload/llm-bridge");

		const exposed = exposedApis.get("llmTutor") as { 
			settings?: { 
				telemetry?: { 
					setState?: (update: { enabled: boolean }) => Promise<{ enabled: boolean; consentTimestamp?: number }> 
				} 
			} 
		} | undefined;
		
		expect(exposed?.settings?.telemetry?.setState).toBeDefined();
		
		if (exposed?.settings?.telemetry?.setState) {
			const result = await exposed.settings.telemetry.setState({ enabled: true });
			expect(result.enabled).toBe(true);
			expect(result.consentTimestamp).toBeDefined();
			expect(typeof result.consentTimestamp).toBe("number");
		}
	});
});
