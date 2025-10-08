import { z } from "zod";

export const accessibilityPreferenceSchema = z.object({
	highContrast: z.boolean(),
	reduceMotion: z.boolean(),
	updatedAt: z.string().datetime()
});

export type AccessibilityPreferencePayload = z.infer<typeof accessibilityPreferenceSchema>;

export interface AccessibilityPreference {
	highContrast: boolean;
	reduceMotion: boolean;
	updatedAt: Date;
}

export function parseAccessibilityPreference(input: unknown): AccessibilityPreference {
	const payload = accessibilityPreferenceSchema.parse(input);
	return {
		highContrast: payload.highContrast,
		reduceMotion: payload.reduceMotion,
		updatedAt: new Date(payload.updatedAt)
	};
}

export const processHealthEventSchema = z.object({
	id: z.string().uuid(),
	occurredAt: z.string().datetime(),
	type: z.enum(["spawn", "exit", "crash", "restart"]),
	exitCode: z.number().int().nullable(),
	reason: z.string().min(1)
});

export type ProcessHealthEventPayload = z.infer<typeof processHealthEventSchema>;

export interface ProcessHealthEvent {
	id: string;
	occurredAt: Date;
	type: "spawn" | "exit" | "crash" | "restart";
	exitCode: number | null;
	reason: string;
}

export function parseProcessHealthEvent(input: unknown): ProcessHealthEvent {
	const payload = processHealthEventSchema.parse(input);
	return {
		id: payload.id,
		occurredAt: new Date(payload.occurredAt),
		type: payload.type,
		exitCode: payload.exitCode,
		reason: payload.reason
	};
}

export const diagnosticsSnapshotSchema = z.object({
	id: z.string().uuid(),
	generatedAt: z.string().datetime(),
	backendStatus: z.enum(["running", "stopped", "error"]),
	backendMessage: z.string().optional(),
	rendererUrl: z.string().url(),
	llmStatus: z.enum(["connected", "unreachable", "disabled"]),
	llmEndpoint: z.string().optional(),
	logDirectory: z.string().min(1),
	snapshotCountLast30d: z.number().int().nonnegative().optional(),
	diskUsageBytes: z.number().int().nonnegative(),
	warnings: z.array(z.string().min(1)).optional(),
	activePreferences: accessibilityPreferenceSchema
});

export type DiagnosticsSnapshotPayload = z.infer<typeof diagnosticsSnapshotSchema>;

export interface DiagnosticsSnapshot {
	id: string;
	generatedAt: Date;
	backendStatus: "running" | "stopped" | "error";
	backendMessage?: string;
	rendererUrl: string;
	llmStatus: "connected" | "unreachable" | "disabled";
	llmEndpoint?: string;
	logDirectory: string;
	snapshotCountLast30d?: number;
	diskUsageBytes: number;
	warnings: string[];
	activePreferences: AccessibilityPreference;
}

export function parseDiagnosticsSnapshot(input: unknown): DiagnosticsSnapshot {
	const payload = diagnosticsSnapshotSchema.parse(input);
	return {
		id: payload.id,
		generatedAt: new Date(payload.generatedAt),
		backendStatus: payload.backendStatus,
		backendMessage: payload.backendMessage,
		rendererUrl: payload.rendererUrl,
		llmStatus: payload.llmStatus,
		llmEndpoint: payload.llmEndpoint && payload.llmEndpoint.length > 0 ? payload.llmEndpoint : undefined,
		logDirectory: payload.logDirectory,
		snapshotCountLast30d: payload.snapshotCountLast30d,
		diskUsageBytes: payload.diskUsageBytes,
		warnings: payload.warnings ?? [],
		activePreferences: parseAccessibilityPreference(payload.activePreferences)
	};
}

export function serializeAccessibilityPreference(preference: AccessibilityPreference): AccessibilityPreferencePayload {
	return {
		highContrast: preference.highContrast,
		reduceMotion: preference.reduceMotion,
		updatedAt: preference.updatedAt.toISOString()
	};
}

export function serializeDiagnosticsSnapshot(snapshot: DiagnosticsSnapshot): DiagnosticsSnapshotPayload {
	return {
		id: snapshot.id,
		generatedAt: snapshot.generatedAt.toISOString(),
		backendStatus: snapshot.backendStatus,
		backendMessage: snapshot.backendMessage,
		rendererUrl: snapshot.rendererUrl,
		llmStatus: snapshot.llmStatus,
		llmEndpoint: snapshot.llmEndpoint,
		logDirectory: snapshot.logDirectory,
		snapshotCountLast30d: snapshot.snapshotCountLast30d,
		diskUsageBytes: snapshot.diskUsageBytes,
		warnings: snapshot.warnings.length > 0 ? snapshot.warnings : undefined,
		activePreferences: serializeAccessibilityPreference(snapshot.activePreferences)
	};
}
