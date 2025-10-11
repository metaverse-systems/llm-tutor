import {
  ProfileSummarySchema,
  type DraftProfile,
  type ProfileListFilter
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import type { HandlerDetails } from "electron";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import url from "node:url";

import {
  registerDiagnosticsIpcHandlers,
  type DiagnosticsIpcRegistration
} from "./ipc/diagnostics";
import { DiagnosticsManager } from "./main/diagnostics";
import { ProfileIpcDiagnosticsRecorder } from "./main/diagnostics/profile-ipc.recorder";
import {
  createProfileIpcRouter,
  type ProfileIpcRouterRegistration,
  type ProfileServiceHandlers
} from "./main/ipc";
import {
  AutoDiscoveryService,
  type AutoDiscoveryProfileService,
  type CreateProfilePayload as AutoDiscoveryCreateProfilePayload,
  type CreateProfileResult as AutoDiscoveryCreateProfileResult,
  type ListProfilesResult as AutoDiscoveryListProfilesResult,
  type RedactedProfile as AutoDiscoveryRedactedProfile
} from "./main/llm/auto-discovery";
import {
  FirstLaunchAutoDiscoveryCoordinator,
  createElectronFirstLaunchStore
} from "./main/llm/first-launch";
import {
  registerLLMHandlers,
  type LlmIpcRegistration
} from "./main/llm/ipc-handlers";
import { SafeStorageOutageService } from "./main/services/safe-storage-outage.service";
import {
  EncryptionService,
  type EncryptionFallbackEvent,
  type SafeStorageAdapter
} from "../../backend/src/infra/encryption/index.js";
import {
  createDiagnosticsLogger,
  type DiagnosticsEvent,
  type DiagnosticsLogger
} from "../../backend/src/infra/logging/index.js";
import {
  ProfileVaultService,
  createElectronProfileVaultStore
} from "../../backend/src/services/llm/profile-vault.js";
import {
  ProfileService,
  type CreateProfilePayload as ServiceCreateProfilePayload
} from "../../backend/src/services/llm/profile.service.js";
import { TestPromptService } from "../../backend/src/services/llm/test-prompt.service.js";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL;
const isAutomation = process.env.PLAYWRIGHT_TEST === "1";

if (isAutomation) {
  app.commandLine.appendSwitch("headless");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,BackForwardCache");
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;
let diagnosticsManager: DiagnosticsManager | null = null;
let diagnosticsIpc: DiagnosticsIpcRegistration | null = null;
let llmRegistration: LlmIpcRegistration | null = null;
let firstLaunchCoordinator: FirstLaunchAutoDiscoveryCoordinator | null = null;
let diagnosticsEventLogger: DiagnosticsLogger | null = null;
let profileIpcRouter: ProfileIpcRouterRegistration | null = null;
let profileDiagnosticsRecorder: ProfileIpcDiagnosticsRecorder | null = null;
let safeStorageOutageService: SafeStorageOutageService | null = null;

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
  }
});

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

function getResourcesPath(): string {
  if (app.isPackaged) {
    return (process as NodeJS.Process & { resourcesPath: string }).resourcesPath;
  }

  return path.resolve(__dirname, "..", "..");
}

function getDiagnosticsLogDirectory(): string | null {
  const directory = diagnosticsManager?.getDiagnosticsDirectory();
  if (directory) {
    return directory;
  }

  try {
    const fallback = path.join(app.getPath("userData"), "diagnostics");
    return fallback;
  } catch (error) {
    console.warn("Failed to resolve diagnostics log directory", error);
    return null;
  }
}

function getDiagnosticsLogger(): DiagnosticsLogger | null {
  if (diagnosticsEventLogger) {
    return diagnosticsEventLogger;
  }

  const directory = getDiagnosticsLogDirectory();
  if (!directory) {
    return null;
  }

  try {
    diagnosticsEventLogger = createDiagnosticsLogger({ logDirectory: directory });
    return diagnosticsEventLogger;
  } catch (error) {
    console.warn("Failed to create diagnostics logger", error);
    diagnosticsEventLogger = null;
    return null;
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
    if (!isAutomation) {
      mainWindow?.show();
    }
    if (isDev && !isAutomation) {
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

  mainWindow.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });
}

async function setupLlmSubsystem(): Promise<void> {
  const logger = console;
  const diagnosticsLogger = getDiagnosticsLogger();
  const recordDiagnosticsEvent = diagnosticsLogger
    ? (event: DiagnosticsEvent) => diagnosticsLogger.record(event)
    : null;

  const profileVaultStore = await createElectronProfileVaultStore();
  const profileVaultService = new ProfileVaultService({ store: profileVaultStore });
  const encryptionService = new EncryptionService({
    safeStorage: createSafeStorageAdapter(logger),
    onFallback: (event) => {
      logEncryptionFallback(event, logger);
      void recordDiagnosticsEvent?.(event);
    }
  });

  const profileService = new ProfileService({
    vaultService: profileVaultService,
    encryptionService,
    diagnosticsRecorder: recordDiagnosticsEvent
      ? {
          record: (event) => recordDiagnosticsEvent(event)
        }
      : null
  });

  const testPromptService = new TestPromptService({
    vaultService: profileVaultService,
    encryptionService,
    diagnosticsRecorder: recordDiagnosticsEvent
      ? {
          record: (event) => recordDiagnosticsEvent(event)
        }
      : null
  });

  const autoDiscoveryService = new AutoDiscoveryService({
    profileService: createAutoDiscoveryProfileServiceAdapter(profileService),
    diagnosticsRecorder: recordDiagnosticsEvent
      ? {
          record: async (event) => {
            logger.info?.("[llm:auto-discovery] diagnostics event", event);
            await recordDiagnosticsEvent(event);
          }
        }
      : {
          record: (event) => {
            logger.info?.("[llm:auto-discovery] diagnostics event", event);
          }
        },
    logger
  });

  llmRegistration?.dispose();
  llmRegistration = await registerLLMHandlers({
    ipcMain,
    profileService,
    testPromptService,
    autoDiscoveryService,
    profileVaultService,
    encryptionService,
    logger
  });

  if (!safeStorageOutageService) {
    safeStorageOutageService = new SafeStorageOutageService();
  }

  const encryptionStatus = encryptionService.getStatus();
  safeStorageOutageService.setAvailability(encryptionStatus.encryptionAvailable);

  if (!profileDiagnosticsRecorder) {
    profileDiagnosticsRecorder = new ProfileIpcDiagnosticsRecorder();
  }

  const profileServiceHandlers: ProfileServiceHandlers = {
    listProfiles: async (filter?: ProfileListFilter) => {
  const result = await profileService.listProfiles();
      const summaries = result.profiles.map((profile) =>
        ProfileSummarySchema.parse({
          id: String(profile.id),
          name: String(profile.name),
          providerType: String(profile.providerType),
          endpointUrl: String(profile.endpointUrl),
          isActive: Boolean(profile.isActive),
          consentTimestamp: profile.consentTimestamp != null ? Number(profile.consentTimestamp) : null,
          lastModified: Number(profile.modifiedAt)
        })
      );

      const allowedProviderTypes = filter?.providerTypes?.length
        ? new Set(filter.providerTypes)
        : null;
      const filteredSummaries = allowedProviderTypes
        ? summaries.filter((summary) => allowedProviderTypes.has(summary.providerType))
        : summaries;

      return {
        profiles: filteredSummaries,
        diagnostics: filter?.includeDiagnostics ? [] : undefined
      };
    },
    createProfile: async (draftProfile: DraftProfile) => {
      const payload: ServiceCreateProfilePayload = {
        name: draftProfile.name,
        providerType: draftProfile.providerType,
        endpointUrl: draftProfile.endpointUrl,
        apiKey: draftProfile.apiKey,
        modelId: draftProfile.modelId ?? null,
        consentTimestamp: draftProfile.consentTimestamp ?? null
      };

  const result = await profileService.createProfile(payload);

      return {
        profile: ProfileSummarySchema.parse({
          id: String(result.profile.id),
          name: String(result.profile.name),
          providerType: String(result.profile.providerType),
          endpointUrl: String(result.profile.endpointUrl),
          isActive: Boolean(result.profile.isActive),
          consentTimestamp: result.profile.consentTimestamp != null
            ? Number(result.profile.consentTimestamp)
            : null,
          lastModified: Number(result.profile.modifiedAt)
        }),
        warning: result.warning
      };
    }
  };

  profileIpcRouter?.dispose();
  profileIpcRouter = createProfileIpcRouter({
    ipcMain,
    profileService: profileServiceHandlers,
    diagnosticsRecorder: profileDiagnosticsRecorder,
    safeStorageOutageService,
    logger
  });

  const firstLaunchStore = await createElectronFirstLaunchStore();
  firstLaunchCoordinator = new FirstLaunchAutoDiscoveryCoordinator({
    autoDiscoveryService,
    store: firstLaunchStore,
    logger
  });

  void firstLaunchCoordinator.maybeRun();
}

function createSafeStorageAdapter(
  logger: Pick<Console, "warn" | "error">
): SafeStorageAdapter | null {
  try {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function") {
      return null;
    }

    return {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (plaintext) => safeStorage.encryptString(plaintext),
      decryptString: (buffer) => safeStorage.decryptString(buffer)
    };
  } catch (error) {
    logger.warn?.("Electron safeStorage unavailable; falling back to plaintext storage.", error);
    return null;
  }
}

function logEncryptionFallback(event: EncryptionFallbackEvent, logger: Pick<Console, "warn" | "error">): void {
  const message =
    `Encryption fallback (${event.operation}:${event.reason}) on ${event.platform}: ${event.message}`;
  logger.warn?.(message);
}

function createAutoDiscoveryProfileServiceAdapter(
  service: ProfileService
): AutoDiscoveryProfileService {
  return {
    async listProfiles(): Promise<AutoDiscoveryListProfilesResult> {
      const result = await service.listProfiles();
      const profiles = result.profiles.map((profile) => ({
        ...profile,
        apiKey: String(profile.apiKey)
      })) as AutoDiscoveryRedactedProfile[];
      return {
        profiles,
        encryptionAvailable: result.encryptionAvailable,
        activeProfileId: result.activeProfileId
      };
    },
    async createProfile(
      payload: AutoDiscoveryCreateProfilePayload
    ): Promise<AutoDiscoveryCreateProfileResult> {
      const result = await service.createProfile(payload as ServiceCreateProfilePayload);
      const profile = {
        ...result.profile,
        apiKey: String(result.profile.apiKey)
      } as AutoDiscoveryRedactedProfile;
      return {
        profile,
        warning: result.warning
      };
    }
  };
}

void app
  .whenReady()
  .then(async () => {
    // Create window first to ensure it's available for testing
    createWindow();

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

    diagnosticsManager.on("backend-error", (payload) => {
      console.warn("Diagnostics backend error", payload.message);
    });

    diagnosticsManager.on("retention-warning", (warning) => {
      console.info("Diagnostics retention warning", warning);
    });

    // Initialize diagnostics after window is created
    await diagnosticsManager.initialize();

    try {
      await setupLlmSubsystem();
    } catch (error) {
      console.warn("Failed to initialize LLM subsystem", error);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error("Failed to initialize Electron app", error);
    dialog.showErrorBox(
      "LLM Tutor",
      "Unable to start the desktop shell. Check the logs for details."
    );
    diagnosticsEventLogger = null;
    profileIpcRouter?.dispose();
    profileIpcRouter = null;
    profileDiagnosticsRecorder = null;
    safeStorageOutageService = null;
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
  llmRegistration?.dispose();
  llmRegistration = null;
  firstLaunchCoordinator = null;
  diagnosticsEventLogger = null;
  profileIpcRouter?.dispose();
  profileIpcRouter = null;
  profileDiagnosticsRecorder = null;
  safeStorageOutageService = null;
});
