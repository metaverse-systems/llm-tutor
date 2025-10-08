import { z } from "zod";

export const storageHealthAlertSchema = z.any();

export type StorageHealthAlertPayload = z.infer<typeof storageHealthAlertSchema>;

export interface StorageHealthAlert {
	status: "ok" | "degraded" | "unavailable";
	detectedAt: Date;
	reason: "permission-denied" | "disk-full" | "corrupted" | "unknown";
	message: string;
	recommendedAction: string;
	retryAvailableAt: Date | null;
}

export function parseStorageHealthAlert(_input: unknown): StorageHealthAlert {
	throw new Error("parseStorageHealthAlert not implemented");
}
