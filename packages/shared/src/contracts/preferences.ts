import { z } from "zod";

/**
 * Telemetry preference schema with opt-out default
 * Tracks learner consent for telemetry data collection
 */
export const telemetryPreferenceSchema = z.object({
	enabled: z.boolean().default(false),
	consentTimestamp: z.number().optional()
});

export type TelemetryPreference = z.infer<typeof telemetryPreferenceSchema>;

/**
 * Creates a default telemetry preference with opt-out
 */
export function createDefaultTelemetryPreference(): TelemetryPreference {
	return {
		enabled: false
	};
}

/**
 * Creates a telemetry preference with opt-in and consent timestamp
 */
export function createOptInTelemetryPreference(): TelemetryPreference {
	return {
		enabled: true,
		consentTimestamp: Date.now()
	};
}

/**
 * Validates and parses telemetry preference data
 */
export function parseTelemetryPreference(input: unknown): TelemetryPreference {
	return telemetryPreferenceSchema.parse(input);
}
