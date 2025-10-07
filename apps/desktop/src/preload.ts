import { contextBridge, ipcRenderer } from "electron";

const api = {
  ping: async (): Promise<string> => ipcRenderer.invoke("diagnostics:snapshot").then(() => "pong"),
  diagnosticsSnapshot: (): Promise<unknown> => ipcRenderer.invoke("diagnostics:snapshot")
};

type DesktopApi = typeof api;

declare global {
  interface Window {
    llmTutor?: DesktopApi;
  }
}

contextBridge.exposeInMainWorld("llmTutor", api);
