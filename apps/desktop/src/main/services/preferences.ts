import type { TelemetryPreference } from "@metaverse-systems/llm-tutor-shared/src/contracts/preferences";
import Store from "electron-store";

interface TelemetryStorePayload {
	telemetry?: TelemetryPreference;
}

interface TelemetryStore {
	read(): TelemetryPreference | undefined;
	write(value: TelemetryPreference): void;
	reset(): void;
}

interface TelemetryStoreBackend {
	get(key: "telemetry"): TelemetryPreference | undefined;
	set(key: "telemetry", value: TelemetryPreference): void;
}

let storeInstance: TelemetryStore | null = null;

function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

/**
 * Initialize the telemetry preference store
 */
function getStore(): TelemetryStore {
	if (!storeInstance) {
		const rawStore = new Store<TelemetryStorePayload>({
		name: "telemetry-preferences",
		defaults: {
			telemetry: {
				enabled: false
			}
		}
		});
		const backend = rawStore as unknown as TelemetryStoreBackend;

		storeInstance = {
			read: () => backend.get("telemetry"),
			write: (value) => backend.set("telemetry", value),
			reset: () => backend.set("telemetry", { enabled: false })
		};
	}

	return storeInstance;
}

/**
 * Get the current telemetry preference state
 * Defaults to opt-out (enabled: false) on first run
 */
export function getTelemetryState(): Promise<TelemetryPreference> {
	try {
		const store = getStore();
		const telemetry = store.read();
		
		// Ensure opt-out default
		if (!telemetry || typeof telemetry.enabled !== "boolean") {
			return Promise.resolve({ enabled: false });
		}

		return Promise.resolve(telemetry);
	} catch (error) {
		console.error("Failed to get telemetry state:", error);
		// Return opt-out default on error
		return Promise.resolve({ enabled: false });
	}
}

/**
 * Set the telemetry preference state
 * Records consent timestamp when enabling
 */
export function setTelemetryState(update: { enabled: boolean }): Promise<TelemetryPreference> {
	try {
		const store = getStore();
		
		const newState: TelemetryPreference = {
			enabled: update.enabled,
			// Record timestamp when opting in
			consentTimestamp: update.enabled ? Date.now() : undefined
		};
		
		store.write(newState);

		return Promise.resolve(newState);
	} catch (error) {
		console.error("Failed to set telemetry state:", error);
		return Promise.reject(toError(error));
	}
}

/**
 * Reset telemetry preferences to default opt-out state
 */
export function resetTelemetryState(): Promise<void> {
	try {
		const store = getStore();
		store.reset();
		return Promise.resolve();
	} catch (error) {
		console.error("Failed to reset telemetry state:", error);
		return Promise.reject(toError(error));
	}
}
