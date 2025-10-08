import { contextBridge } from "electron";
import { createDiagnosticsBridge } from "./preload/diagnostics";

const diagnostics = createDiagnosticsBridge();

const api = {
	ping: async (): Promise<string> => "pong",
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
