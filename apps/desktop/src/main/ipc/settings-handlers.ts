import type { TelemetryPreference } from "@metaverse-systems/llm-tutor-shared/src/contracts/preferences";
import type { IpcMain, IpcMainInvokeEvent, BrowserWindow } from "electron";

type IpcMainLike = Pick<IpcMain, "handle" | "removeHandler">;

export interface SettingsServiceHandlers {
	navigate?: (window: BrowserWindow) => Promise<void> | void;
	getTelemetryState?: () => Promise<TelemetryPreference> | TelemetryPreference;
	setTelemetryState?: (update: { enabled: boolean }) => Promise<TelemetryPreference> | TelemetryPreference;
}

export interface SettingsIpcHandlerOptions {
	ipcMain?: IpcMainLike | null;
	settingsService: SettingsServiceHandlers;
	getMainWindow?: () => BrowserWindow | null;
}

export interface SettingsIpcHandlerRegistration {
	unregister(): void;
}

const SETTINGS_IPC_CHANNELS = Object.freeze({
	navigate: "settings:navigate",
	telemetryGet: "settings:telemetry:get",
	telemetrySet: "settings:telemetry:set"
});

const noop = () => undefined;

export function createSettingsIpcHandlers(
	options: SettingsIpcHandlerOptions
): SettingsIpcHandlerRegistration {
	const { ipcMain, settingsService, getMainWindow } = options;

	if (!ipcMain) {
		return { unregister: noop };
	}

	// Handle navigation to settings
	ipcMain.handle(SETTINGS_IPC_CHANNELS.navigate, async (_event: IpcMainInvokeEvent) => {
		if (settingsService.navigate && getMainWindow) {
			const window = getMainWindow();
			if (window) {
				await settingsService.navigate(window);
			}
		}
	});

	// Handle getting telemetry state
	ipcMain.handle(SETTINGS_IPC_CHANNELS.telemetryGet, async (_event: IpcMainInvokeEvent) => {
		if (settingsService.getTelemetryState) {
			return await settingsService.getTelemetryState();
		}
		// Return default opt-out state if no service available
		return { enabled: false };
	});

	// Handle setting telemetry state
	ipcMain.handle(SETTINGS_IPC_CHANNELS.telemetrySet, async (_event: IpcMainInvokeEvent, update: { enabled: boolean }) => {
		if (settingsService.setTelemetryState) {
			return await settingsService.setTelemetryState(update);
		}
		// Return the update as-is if no service available (for testing)
		return {
			enabled: update.enabled,
			consentTimestamp: update.enabled ? Date.now() : undefined
		};
	});

	return {
		unregister(): void {
			ipcMain.removeHandler(SETTINGS_IPC_CHANNELS.navigate);
			ipcMain.removeHandler(SETTINGS_IPC_CHANNELS.telemetryGet);
			ipcMain.removeHandler(SETTINGS_IPC_CHANNELS.telemetrySet);
		}
	};
}
