import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import url from "node:url";

import {
  registerDiagnosticsIpcHandlers,
  type DiagnosticsIpcRegistration
} from "./ipc/diagnostics";
import { DiagnosticsManager } from "./main/diagnostics";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let diagnosticsManager: DiagnosticsManager | null = null;
let diagnosticsIpc: DiagnosticsIpcRegistration | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    diagnosticsIpc?.emitInitialState();
    return;
  }

  createWindow();
});

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
    diagnosticsIpc?.emitInitialState();
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

void app
  .whenReady()
  .then(async () => {
    diagnosticsManager = new DiagnosticsManager({
      resolveBackendEntry,
      getLogger: () => console,
      getMainWindow: () => mainWindow,
      diagnosticsApiOrigin: process.env.DIAGNOSTICS_API_ORIGIN
    });

    diagnosticsIpc = registerDiagnosticsIpcHandlers({
      ipcMain,
      manager: diagnosticsManager,
      getWebContents: () => mainWindow?.webContents ?? null
    });

    await diagnosticsManager.initialize();
    createWindow();

    diagnosticsManager.on("backend-error", (payload) => {
      console.warn("Diagnostics backend error", payload.message);
    });

    diagnosticsManager.on("retention-warning", (warning) => {
      console.info("Diagnostics retention warning", warning);
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error("Failed to initialize Electron app", error);
    dialog.showErrorBox("LLM Tutor", "Unable to start the desktop shell. Check the logs for details.");
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void diagnosticsManager?.shutdown();
});

app.on("quit", () => {
  diagnosticsIpc?.dispose();
  diagnosticsIpc = null;
  void diagnosticsManager?.shutdown();
  diagnosticsManager = null;
});
