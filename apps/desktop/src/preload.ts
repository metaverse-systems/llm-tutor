import { contextBridge } from "electron";

import { createDiagnosticsBridge } from "./preload/diagnostics";
import {
	LLM_BRIDGE_KEY,
	LLM_TUTOR_KEY,
	createLlmBridge,
	createSettingsBridge
} from "./preload/llm-bridge";

const llmBridge = createLlmBridge();
const settingsBridge = createSettingsBridge();
contextBridge.exposeInMainWorld(LLM_BRIDGE_KEY, llmBridge);

const diagnostics = createDiagnosticsBridge();

const api = {
	ping: (): Promise<string> => Promise.resolve("pong"),
	diagnostics,
	diagnosticsSnapshot: (): Promise<unknown> => diagnostics.requestSummary(),
	settings: settingsBridge
};

type DesktopApi = typeof api;

declare global {
	interface Window {
		llmTutor?: DesktopApi;
	}
}

contextBridge.exposeInMainWorld(LLM_TUTOR_KEY, api);
