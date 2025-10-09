import type { Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";

export interface DiagnosticsWindowHandle {
  app: ElectronApplication;
  window: Page;
}

export async function launchDiagnosticsWindow(): Promise<DiagnosticsWindowHandle> {
  throw new Error("Desktop theme harness not implemented yet.");
}

export async function closeDiagnosticsApp(app: ElectronApplication | null | undefined) {
  if (!app) {
    return;
  }

  await app.close();
}
