import { contextBridge } from "electron";

import "./preload/llm-bridge";
import { createDiagnosticsBridge } from "./preload/diagnostics";

const diagnostics = createDiagnosticsBridge();

const api = {
	ping: (): Promise<string> => Promise.resolve("pong"),
	diagnostics,
	diagnosticsSnapshot: (): Promise<unknown> => diagnostics.requestSummary()
};

type DesktopApi = typeof api;

declare global {
	interface Window {
		llmTutor?: DesktopApi;
	}
}

contextBridge.exposeInMainWorld("llmTutor", api);
