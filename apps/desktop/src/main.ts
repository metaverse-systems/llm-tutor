import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import url from "node:url";
import { ChildProcess, fork } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

interface WindowOpenDetails {
  url: string;
}

function getResourcesPath(): string {
  if (app.isPackaged) {
    return (process as NodeJS.Process & { resourcesPath: string }).resourcesPath;
  }
  return path.resolve(__dirname, "..", "..");
}

function resolveRendererHtml(): string {
  if (isDev && rendererDevServerUrl) {
    return rendererDevServerUrl;
  }

  const packagedRenderer = path.join(getResourcesPath(), "renderer", "index.html");
  if (existsSync(packagedRenderer)) {
    return url.pathToFileURL(packagedRenderer).toString();
  }

  const localRenderer = path.resolve(__dirname, "../../frontend/dist/index.html");
  return url.pathToFileURL(localRenderer).toString();
}

function ensureAppDataFolder(): void {
  const appData = app.getPath("userData");
  const diagnosticsDir = path.join(appData, "diagnostics");
  if (!existsSync(diagnosticsDir)) {
    mkdirSync(diagnosticsDir, { recursive: true });
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const targetUrl = resolveRendererHtml();
  if (targetUrl.startsWith("http")) {
    void mainWindow.loadURL(targetUrl);
  } else {
    void mainWindow.loadURL(targetUrl);
  }

  mainWindow.webContents.setWindowOpenHandler((details: WindowOpenDetails) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });
}

function resolveBackendEntry(): string | null {
  const devEntry = path.resolve(__dirname, "../../backend/dist/index.js");
  if (!app.isPackaged && existsSync(devEntry)) {
    return devEntry;
  }

  const packagedEntry = path.join(getResourcesPath(), "backend", "index.js");
  if (existsSync(packagedEntry)) {
    return packagedEntry;
  }

  return null;
}

function startBackend(): void {
  const entry = resolveBackendEntry();
  if (!entry) {
    console.warn("Backend entry not found. Skipping backend boot.");
    return;
  }

  backendProcess = fork(entry, [], {
    stdio: "inherit",
    env: {
      ...process.env,
      LLM_TUTOR_MODE: app.isPackaged ? "production" : "development"
    }
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Backend process exited with code ${code ?? "unknown"}`);
      if (!app.isPackaged) {
        void dialog.showMessageBox({
          type: "warning",
          title: "Backend exited",
          message: "The local API process stopped unexpectedly. Check the terminal for details."
        });
      }
    }
  });
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.removeAllListeners("exit");
    backendProcess.kill();
    backendProcess = null;
  }
}

function registerDiagnosticsChannel(): void {
  ipcMain.handle("diagnostics:snapshot", async () => {
    return {
      isDev,
      backendRunning: Boolean(backendProcess && !backendProcess.killed),
      rendererUrl: resolveRendererHtml(),
      appVersion: app.getVersion(),
      lastUpdated: new Date().toISOString()
    };
  });
}

app.whenReady().then(() => {
  ensureAppDataFolder();
  registerDiagnosticsChannel();
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("quit", () => {
  stopBackend();
});
