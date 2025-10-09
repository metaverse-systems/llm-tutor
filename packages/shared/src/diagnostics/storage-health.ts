import { z } from "zod";

export const storageHealthAlertSchema = z.object({
	status: z.enum(["ok", "degraded", "unavailable"]),
	detectedAt: z.string().datetime(),
	reason: z.enum(["permission-denied", "disk-full", "corrupted", "unknown"]),
	message: z.string().min(1).max(240),
	recommendedAction: z.string().min(1).max(240),
	retryAvailableAt: z.string().datetime().nullable().optional()
});

export type StorageHealthAlertPayload = z.infer<typeof storageHealthAlertSchema>;

export interface StorageHealthAlert {
	status: "ok" | "degraded" | "unavailable";
	detectedAt: Date;
	reason: "permission-denied" | "disk-full" | "corrupted" | "unknown";
	message: string;
	recommendedAction: string;
	retryAvailableAt: Date | null;
}

export function parseStorageHealthAlert(input: unknown): StorageHealthAlert {
	const payload = storageHealthAlertSchema.parse(input);
	return {
		status: payload.status,
		detectedAt: new Date(payload.detectedAt),
		reason: payload.reason,
		message: payload.message,
		recommendedAction: payload.recommendedAction,
		retryAvailableAt: payload.retryAvailableAt ? new Date(payload.retryAvailableAt) : null
	};
}

export function serializeStorageHealthAlert(alert: StorageHealthAlert): StorageHealthAlertPayload {
	return {
		status: alert.status,
		detectedAt: alert.detectedAt.toISOString(),
		reason: alert.reason,
		message: alert.message,
		recommendedAction: alert.recommendedAction,
		retryAvailableAt: alert.retryAvailableAt ? alert.retryAvailableAt.toISOString() : null
	};
}

export function defaultRecommendedActionFor(reason: StorageHealthAlert["reason"]): string {
	switch (reason) {
		case "disk-full":
			return "Free disk space and retry saving preferences.";
		case "permission-denied":
			return "Check file permissions for the preferences directory and retry.";
		case "corrupted":
			return "Restart the app to rebuild the preferences vault.";
		default:
			return "Retry after a few moments or restart the app.";
	}
}

export function createStorageHealthAlert(options: {
	status?: StorageHealthAlert["status"];
	detectedAt?: Date;
	reason: StorageHealthAlert["reason"];
	message: string;
	recommendedAction?: string;
	retryAvailableAt?: Date | null;
}): StorageHealthAlert {
	return {
		status: options.status ?? "unavailable",
		detectedAt: options.detectedAt ?? new Date(),
		reason: options.reason,
		message: options.message,
		recommendedAction: options.recommendedAction ?? defaultRecommendedActionFor(options.reason),
		retryAvailableAt: options.retryAvailableAt ?? null
	};
}
