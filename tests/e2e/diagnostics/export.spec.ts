import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const desktopRoot = fileURLToPath(new URL("../../../apps/desktop", import.meta.url));

async function launchDesktopApp() {
  const app = await electron.launch({
    args: [path.join(desktopRoot, "dist/main.js")],
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "0",
      ELECTRON_ENABLE_LOGGING: "1",
      LLM_TUTOR_TEST_EXPORT_DIR: path.join(desktopRoot, ".tmp-test-exports")
    }
  });

  return app;
}

async function ensureDirectory(location: string) {
  await fs.mkdir(location, { recursive: true });
}

test.describe("Electron diagnostics export", () => {
  test("saves a JSONL snapshot when export is triggered", async ({}, testInfo) => {
    const exportDir = path.join(testInfo.outputDir, "electron-diagnostics-exports");
    await ensureDirectory(exportDir);

    const electronApp = await launchDesktopApp();

    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

    await window.getByTestId("landing-diagnostics-cta").click();
    await window.waitForSelector('[data-testid="diagnostics-export-button"]');

    const downloadPromise = window.waitForEvent("download");
    await window.getByTestId("diagnostics-export-button").click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/diagnostics-snapshot-\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z\.jsonl/);

    const savePath = path.join(exportDir, filename);
    await download.saveAs(savePath);

    const fileContents = await fs.readFile(savePath, "utf-8");
    expect(fileContents.trim()).not.toHaveLength(0);

    await electronApp.close();
  });
});
