import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";

import type { Page } from "@playwright/test";
import {
  createDiagnosticsPreferenceRecord,
  serializeDiagnosticsPreferenceRecord
} from "@metaverse-systems/llm-tutor-shared";
import { _electron as electron, type ElectronApplication } from "playwright";

export interface DiagnosticsWindowHandle {
  app: ElectronApplication;
  window: Page;
}

const rendererServerRegistry = new WeakMap<ElectronApplication, http.Server>();

let buildArtifactsPromise: Promise<void> | null = null;

export async function launchDiagnosticsWindow(): Promise<DiagnosticsWindowHandle> {
  const workspace = await prepareHarnessWorkspace();
  await ensureBuildArtifacts(workspace);
  const rendererServer = await startRendererServer(workspace.desktopRoot);

  let app: ElectronApplication | null = null;

  try {
    app = await electron.launch({
    args: [workspace.desktopRoot],
    cwd: workspace.desktopRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      NODE_ENV: process.env.NODE_ENV ?? "test",
      LLM_TUTOR_DEV_BACKEND_LOCK: workspace.backendLockPath,
      ELECTRON_USER_DATA_DIR: workspace.primaryUserDataDir,
      XDG_CONFIG_HOME: workspace.configRoot,
      APPDATA: workspace.configRoot,
        PLAYWRIGHT_TEST: "1",
        ELECTRON_RENDERER_URL: rendererServer.origin
    }
  });
  } catch (error) {
    await stopRendererServer(rendererServer.server);
    throw error;
  }

  rendererServerRegistry.set(app, rendererServer.server);

  const resolvedUserDataDir = await app.evaluate(async ({ app: electronApp }) => {
    return electronApp.getPath("userData");
  });

  if (!workspace.allUserDataDirs.includes(resolvedUserDataDir)) {
    await fs.mkdir(resolvedUserDataDir, { recursive: true });
    await seedPreferences(resolvedUserDataDir);
  }

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  let themeState = await readThemeState(window);

  if (themeState.theme !== "contrast" || themeState.motion !== "reduced") {
    await primeRendererTheme(window);
    themeState = await readThemeState(window);
  }

  await window.waitForFunction(() => {
    const body = document.body;
    return (
      !!body &&
      body.getAttribute("data-theme") === "contrast" &&
      body.getAttribute("data-motion") === "reduced"
    );
  });

  return { app, window };
}

export async function closeDiagnosticsApp(app: ElectronApplication | null | undefined) {
  if (!app) {
    return;
  }

  await app.close();
  const server = rendererServerRegistry.get(app);
  if (server) {
    await stopRendererServer(server);
    rendererServerRegistry.delete(app);
  }
}

interface HarnessWorkspace {
  desktopRoot: string;
  projectRoot: string;
  configRoot: string;
  primaryUserDataDir: string;
  allUserDataDirs: readonly string[];
  backendLockPath: string;
}

async function prepareHarnessWorkspace(): Promise<HarnessWorkspace> {
  const desktopRoot = path.resolve(__dirname, "..", "..");
  const projectRoot = path.resolve(desktopRoot, "..", "..");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-tutor-desktop-tests-"));
  const configRoot = path.join(tempRoot, "config");
  await fs.mkdir(configRoot, { recursive: true });

  const packageJson = await readDesktopPackageJson(desktopRoot);
  const candidateNames = buildUserDataCandidates(packageJson);
  const userDataDirs: string[] = [];

  for (const name of candidateNames) {
    const targetDir = path.join(configRoot, name);
    await fs.mkdir(targetDir, { recursive: true });
    userDataDirs.push(targetDir);
    await seedPreferences(targetDir);
  }

  const primaryUserDataDir = userDataDirs[0];
  const backendLockPath = path.join(tempRoot, "diagnostics", "backend.dev.lock");

  return {
    desktopRoot,
    projectRoot,
    configRoot,
    primaryUserDataDir,
    allUserDataDirs: userDataDirs,
    backendLockPath
  };
}

async function ensureBuildArtifacts(workspace: HarnessWorkspace): Promise<void> {
  if (!buildArtifactsPromise) {
    buildArtifactsPromise = (async () => {
      await ensureFrontendDist(workspace);
      await ensureDesktopDist(workspace);
    })();
  }

  await buildArtifactsPromise;
}

async function ensureFrontendDist(workspace: HarnessWorkspace): Promise<void> {
  const frontendDist = path.resolve(workspace.desktopRoot, "../frontend/dist/index.html");
  if (await pathExists(frontendDist)) {
    return;
  }

  await runWorkspaceCommand("@metaverse-systems/llm-tutor-frontend", "build", workspace.projectRoot);
}

async function ensureDesktopDist(workspace: HarnessWorkspace): Promise<void> {
  const desktopDist = path.join(workspace.desktopRoot, "dist", "main.js");
  if (await pathExists(desktopDist)) {
    return;
  }

  await runWorkspaceCommand("@metaverse-systems/llm-tutor-desktop", "build", workspace.projectRoot);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function runWorkspaceCommand(workspaceName: string, script: string, projectRoot: string): Promise<void> {
  await runCommand("npm", ["run", "--workspace", workspaceName, script], projectRoot);
}

async function runCommand(command: string, args: readonly string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function seedPreferences(userDataDir: string): Promise<void> {
  const record = createDiagnosticsPreferenceRecord({
    highContrastEnabled: true,
    reducedMotionEnabled: true,
    updatedBy: "main"
  });

  const payload = serializeDiagnosticsPreferenceRecord(record);
  const storeFile = path.join(userDataDir, "diagnostics-preferences.json");
  const contents = JSON.stringify({ record: payload }, null, 2);
  await fs.writeFile(storeFile, contents, "utf-8");
}

async function readThemeState(page: Page) {
  return await page.evaluate(() => {
    const body = document.body;
    return {
      theme: body?.getAttribute("data-theme") ?? null,
      motion: body?.getAttribute("data-motion") ?? null,
      appearance: body?.dataset.appearance ?? null
    } as const;
  });
}

async function primeRendererTheme(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = {
      appearance: "high-contrast" as const,
      motion: "reduced" as const
    };
    window.localStorage.setItem("llm-tutor:theme-mode", JSON.stringify(state));
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

interface RendererServerHandle {
  server: http.Server;
  origin: string;
}

async function startRendererServer(desktopRoot: string): Promise<RendererServerHandle> {
  const distRoot = path.resolve(desktopRoot, "../frontend/dist");
  const indexPath = path.join(distRoot, "index.html");
  await fs.access(indexPath);

  const server = http.createServer(async (request, response) => {
    try {
      const target = new URL(request.url ?? "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(target.pathname);
      if (!pathname || pathname === "/") {
        pathname = "/index.html";
      }
      const safePath = pathNormalize(distRoot, pathname);
      const fileStat = await fs.stat(safePath).catch(() => null);
      let filePath = safePath;

      if (!fileStat) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not Found");
        return;
      }

      if (fileStat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      const data = await fs.readFile(filePath);
      response.writeHead(200, {
        "content-type": resolveContentType(filePath),
        "cache-control": "no-store"
      });
      response.end(data);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
  response.end("Internal Server Error");
  console.error("[themeHarness] renderer server error", error);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await stopRendererServer(server);
    throw new Error("Failed to determine renderer server address");
  }

  const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;
  return { server, origin };
}

async function stopRendererServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

function resolveContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html";
    case ".js":
      return "application/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".map":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function pathNormalize(root: string, pathname: string): string {
  const sanitized = pathname.replace(/^\/+/u, "");
  const base = path.resolve(root);
  const targetPath = path.normalize(path.join(base, sanitized));
  if (!targetPath.startsWith(base)) {
    throw new Error("Path traversal attempt detected");
  }
  return targetPath;
}

async function readDesktopPackageJson(desktopRoot: string): Promise<Record<string, unknown>> {
  const packagePath = path.join(desktopRoot, "package.json");
  const raw = await fs.readFile(packagePath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function buildUserDataCandidates(packageJson: Record<string, unknown>): string[] {
  const candidates = new Set<string>();
  const fromBuild = (packageJson.build as { productName?: unknown } | undefined)?.productName;
  const productName = packageJson.productName;
  const packageName = packageJson.name;

  const appendIfValid = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      candidates.add(value.trim());
    }
  };

  appendIfValid(fromBuild);
  appendIfValid(productName);
  appendIfValid(packageName);

  if (candidates.size === 0) {
    candidates.add("llm-tutor");
  }

  return Array.from(candidates);
}
