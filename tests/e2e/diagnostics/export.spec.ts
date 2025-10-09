import { test, expect, type Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { preview as createPreviewServer, type PreviewServer } from "vite";

const electronLauncher = fileURLToPath(new URL("../tools/electron-launcher.cjs", import.meta.url));

const desktopRoot = fileURLToPath(new URL("../../../apps/desktop", import.meta.url));
const frontendRoot = fileURLToPath(new URL("../../../apps/frontend", import.meta.url));

const previewHost = "127.0.0.1";
const previewPort = 4318;
const previewUrl = `http://${previewHost}:${previewPort}`;

let rendererPreview: PreviewServer | null = null;

async function waitForRendererReady(url: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore connection errors while the server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Renderer preview at ${url} did not become ready`);
}

async function startRendererPreview() {
  if (rendererPreview) {
    return;
  }

  rendererPreview = await createPreviewServer({
    root: frontendRoot,
    preview: {
      host: previewHost,
      port: previewPort,
      strictPort: true
    }
  });

  rendererPreview.printUrls();
  await waitForRendererReady(previewUrl);
  process.env.ELECTRON_RENDERER_URL = previewUrl;
}

async function stopRendererPreview() {
  if (!rendererPreview) {
    return;
  }

  await rendererPreview.close();
  rendererPreview = null;
  delete process.env.ELECTRON_RENDERER_URL;
}

async function launchDesktopApp(exportDir: string) {
  const rawEnv: Record<string, string | undefined> = { ...process.env };
  delete rawEnv.NODE_OPTIONS;
  rawEnv.LLM_TUTOR_TEST_EXPORT_DIR = exportDir;

  const env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;

  const app = await electron.launch({
    executablePath: electronLauncher,
    args: [path.join(desktopRoot, "dist/main.js")],
    env
  });

  return app;
}

async function ensureDirectory(location: string) {
  await fs.mkdir(location, { recursive: true });
}

async function waitForDownloadedFile(directory: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const entries = await fs.readdir(directory);
    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > 0) {
          return fullPath;
        }
      } catch {
        // Ignore files that might be removed between readdir/stat attempts.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Diagnostics export was not saved to ${directory} within ${timeoutMs}ms`);
}

async function ensureSnapshotAvailable(window: Page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  let lastError: string | null = null;
  let lastRefreshed: unknown = null;

  while (Date.now() < deadline) {
    const { snapshot, refreshed } = await window.evaluate(async () => {
      const api = (window as unknown as {
        llmTutor?: {
          diagnostics?: {
            requestSummary?: () => Promise<unknown>;
            refreshSnapshot?: () => Promise<{ snapshot?: unknown; error?: { message?: string } } | null>;
          };
        };
      }).llmTutor;

      if (!api?.diagnostics) {
        return { snapshot: null, refreshed: null };
      }

      const refreshedResult = await api.diagnostics.refreshSnapshot?.();
      if (refreshedResult?.snapshot) {
        return { snapshot: refreshedResult.snapshot, refreshed: refreshedResult };
      }

      const summary = await api.diagnostics.requestSummary?.();
      return { snapshot: summary, refreshed: refreshedResult };
    });

    if (snapshot && typeof snapshot === "object") {
      const generatedAt = (snapshot as { generatedAt?: string }).generatedAt;
      if (typeof generatedAt === "string" && generatedAt.length > 0) {
        return;
      }
    }

    if (refreshed && typeof refreshed === "object") {
      lastRefreshed = refreshed;
      const message = (refreshed as { error?: { message?: string } }).error?.message;
      if (message) {
        lastError = message;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const context = lastError ?? (lastRefreshed ? JSON.stringify(lastRefreshed) : null);
  throw new Error(
    context
      ? `Diagnostics snapshot was not generated in time: ${context}`
      : "Diagnostics snapshot was not generated in time"
  );
}

async function waitForDiagnosticsBridge(window: Page, timeoutMs = 30_000) {
  await window.waitForFunction(
    () => {
      const api = (window as unknown as {
        llmTutor?: {
          diagnostics?: {
            refreshSnapshot?: unknown;
            requestSummary?: unknown;
          };
        };
      }).llmTutor;

      return Boolean(api?.diagnostics?.refreshSnapshot && api.diagnostics.requestSummary);
    },
    { timeout: timeoutMs }
  );
}

test.describe("Electron diagnostics export", () => {
  test.beforeAll(async () => {
    await startRendererPreview();
  });

  test.afterAll(async () => {
    await stopRendererPreview();
  });

  test("saves a JSONL snapshot when export is triggered", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const exportDir = path.join(testInfo.outputDir, "electron-diagnostics-exports");
    await ensureDirectory(exportDir);

    const electronApp = await launchDesktopApp(exportDir);
    const spawnArgs = electronApp.process().spawnargs;
    const remoteDebugArg = spawnArgs.find((arg) => arg.startsWith("--remote-debugging-port="));
    expect(remoteDebugArg, "launcher must provide a remote debugging port argument").toBeDefined();
    const resolvedPort = Number.parseInt(remoteDebugArg!.split("=")[1] ?? "0", 10);
    expect(resolvedPort, "remote debugging port should be a positive integer").toBeGreaterThan(0);
    expect(resolvedPort, "remote debugging port should be dynamically assigned").not.toBe(9222);

    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

    await waitForDiagnosticsBridge(window);
    await ensureSnapshotAvailable(window);
    const snapshotStatus = window.getByTestId("diagnostics-snapshot-status");
    await expect(snapshotStatus).toHaveText(/snapshot ready/i);

    const highContrastToggle = window.getByTestId("diagnostics-high-contrast-toggle");
    await expect(highContrastToggle).toBeVisible();
    await highContrastToggle.focus();
    await expect(highContrastToggle).toBeFocused();
    await window.keyboard.press("Space");
    await expect(highContrastToggle).toHaveAttribute("data-active", "true");

    const reducedMotionToggle = window.getByTestId("diagnostics-reduced-motion-toggle");
    await expect(reducedMotionToggle).toBeVisible();
    await reducedMotionToggle.focus();
    await expect(reducedMotionToggle).toBeFocused();
    await window.keyboard.press("Space");
    await expect(reducedMotionToggle).toHaveAttribute("data-active", "true");

    const landingCta = window.getByTestId("landing-diagnostics-cta");
    await expect(landingCta).toBeVisible();
    await landingCta.focus();
    await expect(landingCta).toBeFocused();
    await window.keyboard.press("Enter");
    await window.waitForSelector('[data-testid="diagnostics-export-button"]');

    const exportButton = window.getByTestId("diagnostics-export-button");
    await expect(exportButton).toBeVisible();
    await exportButton.focus();
    await expect(exportButton).toBeFocused();
    await window.keyboard.press("Enter");

    const downloadedFile = await waitForDownloadedFile(exportDir);
    const filename = path.basename(downloadedFile);
    expect(filename).toMatch(/diagnostics-snapshot-\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z\.jsonl/);

    const fileContents = await fs.readFile(downloadedFile, "utf-8");
    expect(fileContents.trim()).not.toHaveLength(0);

    const exportArtifacts = await fs.readdir(exportDir);
    const logFile = exportArtifacts.find((entry) => entry.endsWith("-export.log.jsonl"));
    expect(logFile, "export log JSONL should be written alongside snapshot").toBeDefined();
    const logContents = await fs.readFile(path.join(exportDir, logFile!), "utf-8");
    expect(logContents).toContain('"status":"success"');
    expect(logContents).toMatch(/"exportPath":".+\.jsonl"/);
    expect(logContents).toMatch(/"accessibilityState"\s*:\s*\{/);

    await electronApp.close();
  });
});
