import { test, expect, type Page } from "@playwright/test";
import type { DiagnosticsExportLogEntry } from "@metaverse-systems/llm-tutor-shared";
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ACCESSIBILITY_TOGGLE_TEST_IDS = {
  highContrast: "landing-accessibility-toggle-high-contrast",
  reduceMotion: "landing-accessibility-toggle-reduce-motion",
  remoteProviders: "landing-accessibility-toggle-remote-providers"
} as const;

const formatStatusEntry = (message: string) => `[${new Date().toISOString()}] ${message}`;

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

    await sleep(250);
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

async function launchDesktopApp(exportDir: string, options: { exportMode?: "permission-denied" } = {}) {
  const rawEnv: Record<string, string | undefined> = { ...process.env };
  delete rawEnv.NODE_OPTIONS;
  rawEnv.LLM_TUTOR_TEST_EXPORT_DIR = exportDir;
  if (options.exportMode) {
    rawEnv.LLM_TUTOR_TEST_EXPORT_MODE = options.exportMode;
  } else {
    delete rawEnv.LLM_TUTOR_TEST_EXPORT_MODE;
  }

  const env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;

  env.PLAYWRIGHT_HEADLESS ??= "1";
  env.PLAYWRIGHT_OFFLINE ??= "1";

  const preferredPort = env.LLM_TUTOR_REMOTE_DEBUG_PORT ?? process.env.LLM_TUTOR_REMOTE_DEBUG_PORT;
  if (preferredPort) {
    env.LLM_TUTOR_REMOTE_DEBUG_PORT = preferredPort;
  }

  const remoteDebugFlag = preferredPort
    ? `--remote-debugging-port=${preferredPort}`
    : "--remote-debugging-port=0";

  const electronArgs = [remoteDebugFlag, path.join(desktopRoot, "dist/main.js")];

  const app = await electron.launch({
    executablePath: electronLauncher,
    args: electronArgs,
    env
  });

  return app;
}

async function closeElectronApp(app: ElectronApplication | null | undefined) {
  if (!app) {
    return;
  }

  const child = app.process();
  let timeoutHandle: NodeJS.Timeout | null = null;
  const closePromise = app.close().catch((error) => {
    console.warn("Electron application close failed", error);
  });

  const timeoutMs = 10_000;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      if (!child.killed) {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          console.warn("Failed to force kill Electron process", error);
        }
      }
      resolve();
    }, timeoutMs);
  });

  await Promise.race([closePromise, timeoutPromise]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }

  await Promise.race([closePromise, new Promise<void>((resolve) => setTimeout(resolve, 1_000))]);

  if (child.exitCode === null) {
    const exitPromise = new Promise<void>((resolve) => {
      const finalize = () => {
        child.removeListener("exit", finalize);
        child.removeListener("close", finalize);
        resolve();
      };
      child.once("exit", finalize);
      child.once("close", finalize);
    });

    await Promise.race([exitPromise, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
  }
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

    await sleep(200);
  }

  throw new Error(`Diagnostics export was not saved to ${directory} within ${timeoutMs}ms`);
}

function isExportLogFilename(filename: string): boolean {
  return filename.includes("-export") && filename.endsWith(".log.jsonl");
}

async function waitForExportLog(directory: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const entries = await fs.readdir(directory);
    const logEntry = entries.find((entry) => isExportLogFilename(entry));
    if (logEntry) {
      const fullPath = path.join(directory, logEntry);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > 0) {
          return fullPath;
        }
      } catch {
        // Ignore files that might be removed between readdir/stat attempts.
      }
    }

    await sleep(200);
  }

  throw new Error(`Diagnostics export log was not captured in ${directory} within ${timeoutMs}ms`);
}

async function collectExportArtifacts(directory: string) {
  const entries = await fs.readdir(directory);
  const snapshotEntry = entries.find((entry) => entry.endsWith(".jsonl") && !isExportLogFilename(entry));
  const logEntry = entries.find((entry) => isExportLogFilename(entry));

  const snapshotPath = snapshotEntry ? path.join(directory, snapshotEntry) : null;
  const logPath = logEntry ? path.join(directory, logEntry) : null;
  const logContents = logPath ? await fs.readFile(logPath, "utf-8") : "";
  const logEntries: DiagnosticsExportLogEntry[] = logContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as DiagnosticsExportLogEntry);

  return { snapshotPath, logPath, logContents, logEntries };
}

async function enableAccessibilityToggle(window: Page, testId: string) {
  const toggle = window.getByTestId(testId);
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await expect(toggle).toBeFocused();
  const currentState = await toggle.getAttribute("aria-checked");
  if (currentState === "true") {
    return;
  }

  await window.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
}

async function expectAutomationState(window: Page, expected: Record<string, unknown>) {
  await expect
    .poll(async () => {
      return window.evaluate(() => {
        const automation = (window as unknown as Window & {
          __diagnosticsAutomation?: {
            getAccessibilityState?: () => Record<string, unknown>;
          };
        }).__diagnosticsAutomation;
        return automation?.getAccessibilityState?.() ?? null;
      });
    })
    .toMatchObject(expected);
}

async function ensureSnapshotAvailable(
  window: Page,
  options: { timeoutMs?: number; onStatus?: (entry: string) => void } = {}
) {
  const { timeoutMs = 30_000, onStatus } = options;
  const deadline = Date.now() + timeoutMs;

  let lastError: string | null = null;
  let lastRefreshed: unknown = null;
  let attempt = 0;
  let delay = 500;
  const history: string[] = [];

  const logStatus = (message: string) => {
    const entry = formatStatusEntry(message);
    history.push(entry);
    onStatus?.(entry);
    console.info(`[diagnostics-export][snapshot] ${entry}`);
  };

  while (Date.now() < deadline) {
    attempt += 1;
    logStatus(`Attempt ${attempt}: requesting diagnostics snapshot state`);
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

    logStatus(
      lastError
        ? `Snapshot not ready yet; last error: ${lastError}`
        : "Snapshot not ready yet; continuing to poll"
    );

    await sleep(delay);
    delay = Math.min(delay * 2, 4_000);
  }

  const context = lastError ?? (lastRefreshed ? JSON.stringify(lastRefreshed) : null);
  logStatus("Timed out waiting for diagnostics snapshot to become ready");
  const statusLog = history.join("\n");

  const message =
    context && context.length > 0
      ? `Diagnostics snapshot was not generated in time: ${context}`
      : "Diagnostics snapshot was not generated in time";

  const error = new Error(`${message}\nStatus log:\n${statusLog}`);
  (error as Error & { history?: string[] }).history = history;
  throw error;
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
  test.beforeEach(async () => {
    await startRendererPreview();
  });

  test.afterEach(async () => {
    await stopRendererPreview();
    const getActiveHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
    if (typeof getActiveHandles === "function") {
      const handles = getActiveHandles();
      for (const handle of handles) {
        if (handle && typeof (handle as { unref?: () => void }).unref === "function") {
          try {
            (handle as { unref: () => void }).unref();
          } catch (error) {
            console.warn("Failed to unref handle", error);
          }
        }
      }
    }
  });

  test("saves a JSONL snapshot when export is triggered", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const exportDir = path.join(testInfo.outputDir, "electron-diagnostics-exports");
    await ensureDirectory(exportDir);

    const electronApp = await launchDesktopApp(exportDir);
    const snapshotWaitLog: string[] = [];

    try {
      const spawnArgs = electronApp.process().spawnargs;
      const remoteDebugArg = spawnArgs.find((arg) => arg.startsWith("--remote-debugging-port"));
      expect(remoteDebugArg, "launcher must provide a remote debugging port argument").toBeDefined();

      const resolvedPortEnv = await electronApp.evaluate(() => {
        const port = process.env.ELECTRON_REMOTE_DEBUGGING_PORT;
        return typeof port === "string" ? port : null;
      });

      expect(resolvedPortEnv, "launcher should expose remote debugging port via env").not.toBeNull();
      const resolvedPort = Number.parseInt(resolvedPortEnv ?? "0", 10);
      expect(resolvedPort, "remote debugging port should be a positive integer").toBeGreaterThan(0);
      expect(resolvedPort, "remote debugging port should be dynamically assigned").not.toBe(9222);

      const window = await electronApp.firstWindow();
      await window.waitForLoadState("domcontentloaded");
      await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

      await waitForDiagnosticsBridge(window);

      try {
        await ensureSnapshotAvailable(window, { onStatus: (entry) => snapshotWaitLog.push(entry) });
      } catch (error) {
        if (snapshotWaitLog.length > 0) {
          await testInfo.attach("snapshot-wait-log", {
            body: snapshotWaitLog.join("\n"),
            contentType: "text/plain"
          });
        }
        throw error;
      }

      const snapshotStatus = window.getByTestId("diagnostics-snapshot-status");
      await expect(snapshotStatus).toHaveText(/snapshot ready/i);

      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.highContrast);
      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.reduceMotion);
      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.remoteProviders);

      await window.evaluate(() => {
        const automation = (window as unknown as Window & {
          __diagnosticsAutomation?: {
            setKeyboardNavigationVerified?: (value: boolean) => void;
          };
        }).__diagnosticsAutomation;
        automation?.setKeyboardNavigationVerified?.(true);
      });

      await expectAutomationState(window, {
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: true,
        keyboardNavigationVerified: true
      });

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
      await waitForExportLog(exportDir);

      const filename = path.basename(downloadedFile);
      expect(filename).toMatch(/diagnostics-snapshot-\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z\.jsonl/);

      const fileContents = await fs.readFile(downloadedFile, "utf-8");
      expect(fileContents.trim()).not.toHaveLength(0);

      const { snapshotPath, logPath, logContents, logEntries } = await collectExportArtifacts(exportDir);
      expect(snapshotPath, "snapshot JSONL should be present").not.toBeNull();
      expect(logPath, "export log JSONL should be written alongside snapshot").not.toBeNull();

      const latestEntry = logEntries.at(-1);
      expect(latestEntry?.status).toBe("success");
      expect(latestEntry?.exportPath).toContain(".jsonl");
      expect(latestEntry?.accessibilityState).toMatchObject({
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: true,
        keyboardNavigationVerified: true
      });

      await testInfo.attach("diagnostics-export-log-success", {
        body: logContents,
        contentType: "application/json"
      });
    } finally {
      await closeElectronApp(electronApp);
    }
  });

  test("surfaces a toast when the export directory is unavailable", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const exportDir = path.join(testInfo.outputDir, "electron-diagnostics-exports-permission-denied");
    await ensureDirectory(exportDir);

    const electronApp = await launchDesktopApp(exportDir, { exportMode: "permission-denied" });
    const snapshotWaitLog: string[] = [];

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState("domcontentloaded");
      await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

      await waitForDiagnosticsBridge(window);

      try {
        await ensureSnapshotAvailable(window, { onStatus: (entry) => snapshotWaitLog.push(entry) });
      } catch (error) {
        if (snapshotWaitLog.length > 0) {
          await testInfo.attach("snapshot-wait-log-permission-denied", {
            body: snapshotWaitLog.join("\n"),
            contentType: "text/plain"
          });
        }
        throw error;
      }

      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.highContrast);
      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.reduceMotion);
      await enableAccessibilityToggle(window, ACCESSIBILITY_TOGGLE_TEST_IDS.remoteProviders);

      await window.evaluate(() => {
        const automation = (window as unknown as Window & {
          __diagnosticsAutomation?: {
            setKeyboardNavigationVerified?: (value: boolean) => void;
          };
        }).__diagnosticsAutomation;
        automation?.setKeyboardNavigationVerified?.(true);
      });

      await expectAutomationState(window, {
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: true,
        keyboardNavigationVerified: true
      });

      const landingCta = window.getByTestId("landing-diagnostics-cta");
      await landingCta.click();
      const exportButton = window.getByTestId("diagnostics-export-button");
      await exportButton.click();

      await expect(window.locator('[role="alert"]').filter({ hasText: /Diagnostics export failed/i })).toBeVisible();

      await waitForExportLog(exportDir);
      const { snapshotPath, logPath, logContents, logEntries } = await collectExportArtifacts(exportDir);

      expect(snapshotPath, "snapshot should not be written when export fails").toBeNull();
      expect(logPath, "export log should capture failure context").not.toBeNull();

      const latestEntry = logEntries.at(-1);
      expect(latestEntry?.status).toBe("failure");
      expect(latestEntry?.messages?.some((message) => message.includes("Permission denied"))).toBe(true);
      expect(latestEntry?.accessibilityState).toMatchObject({
        highContrastEnabled: true,
        reducedMotionEnabled: true,
        remoteProvidersEnabled: true,
        keyboardNavigationVerified: true
      });

      await testInfo.attach("diagnostics-export-log-permission-denied", {
        body: logContents,
        contentType: "application/json"
      });
    } finally {
      await closeElectronApp(electronApp);
    }
  });
});
