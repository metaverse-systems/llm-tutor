import type { TelemetryPreference } from "@metaverse-systems/llm-tutor-shared/src/contracts/preferences";
import type ElectronStore from "electron-store";

interface TelemetryStorePayload {
	telemetry?: TelemetryPreference;
}

let storeInstance: ElectronStore<TelemetryStorePayload> | null = null;

/**
 * Initialize the telemetry preference store
 */
async function getStore(): Promise<ElectronStore<TelemetryStorePayload>> {
	if (storeInstance) {
		return storeInstance;
	}

	const ElectronStoreModule = await import("electron-store");
	const ElectronStoreConstructor =
		typeof ElectronStoreModule === "function"
			? ElectronStoreModule
			: ElectronStoreModule.default;

	storeInstance = new ElectronStoreConstructor<TelemetryStorePayload>({
		name: "telemetry-preferences",
		defaults: {
			telemetry: {
				enabled: false
			}
		}
	});

	return storeInstance;
}

/**
 * Get the current telemetry preference state
 * Defaults to opt-out (enabled: false) on first run
 */
export async function getTelemetryState(): Promise<TelemetryPreference> {
	try {
		const store = await getStore();
		const telemetry = store.get("telemetry");
		
		// Ensure opt-out default
		if (!telemetry || typeof telemetry.enabled !== "boolean") {
			return { enabled: false };
		}
		
		return telemetry;
	} catch (error) {
		console.error("Failed to get telemetry state:", error);
		// Return opt-out default on error
		return { enabled: false };
	}
}

/**
 * Set the telemetry preference state
 * Records consent timestamp when enabling
 */
export async function setTelemetryState(update: { enabled: boolean }): Promise<TelemetryPreference> {
	try {
		const store = await getStore();
		
		const newState: TelemetryPreference = {
			enabled: update.enabled,
			// Record timestamp when opting in
			consentTimestamp: update.enabled ? Date.now() : undefined
		};
		
		store.set("telemetry", newState);
		
		return newState;
	} catch (error) {
		console.error("Failed to set telemetry state:", error);
		throw error;
	}
}

/**
 * Reset telemetry preferences to default opt-out state
 */
export async function resetTelemetryState(): Promise<void> {
	try {
		const store = await getStore();
		store.set("telemetry", { enabled: false });
	} catch (error) {
		console.error("Failed to reset telemetry state:", error);
		throw error;
	}
}
