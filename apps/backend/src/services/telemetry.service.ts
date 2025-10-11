import type { TelemetryPreference } from "@metaverse-systems/llm-tutor-shared/src/contracts/preferences";

/**
 * Backend telemetry service
 * Tracks telemetry preference state and respects opt-out defaults
 */
export class TelemetryService {
	private telemetryState: TelemetryPreference = {
		enabled: false
	};

	/**
	 * Get current telemetry state
	 */
	getTelemetryState(): TelemetryPreference {
		return { ...this.telemetryState };
	}

	/**
	 * Update telemetry state
	 * Should be called when preference changes via IPC
	 */
	setTelemetryState(state: TelemetryPreference): void {
		this.telemetryState = { ...state };
	}

	/**
	 * Check if telemetry is enabled
	 */
	isEnabled(): boolean {
		return this.telemetryState.enabled === true;
	}

	/**
	 * Reset to opt-out default
	 */
	reset(): void {
		this.telemetryState = { enabled: false };
	}
}

/**
 * Singleton instance for backend telemetry state
 */
let telemetryServiceInstance: TelemetryService | null = null;

export function getTelemetryService(): TelemetryService {
	if (!telemetryServiceInstance) {
		telemetryServiceInstance = new TelemetryService();
	}
	return telemetryServiceInstance;
}

export function createTelemetryService(): TelemetryService {
	return new TelemetryService();
}
