export {}; // Ensures this file is treated as a module

declare global {
  interface Window {
    llmTutor?: {
      ping: () => Promise<string>;
      diagnosticsSnapshot: () => Promise<unknown>;
    };
  }
}
