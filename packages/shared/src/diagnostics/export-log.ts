import { z } from "zod";

export const diagnosticsAccessibilityStateSchema = z
  .object({
    highContrastEnabled: z.boolean().optional(),
    reducedMotionEnabled: z.boolean().optional(),
    remoteProvidersEnabled: z.boolean().optional(),
    keyboardNavigationVerified: z.boolean().optional()
  })
  .strict();

export type DiagnosticsAccessibilityStateLog = z.infer<typeof diagnosticsAccessibilityStateSchema>;

export const diagnosticsExportLogEntrySchema = z
  .object({
    timestamp: z.string().datetime().optional(),
    status: z.enum(["success", "failure"]),
    exportPath: z.string().min(1).optional(),
    snapshotId: z.string().min(1).optional(),
    accessibilityState: diagnosticsAccessibilityStateSchema.optional(),
    messages: z.array(z.string().min(1)).optional(),
    storageAlerts: z.array(z.string().min(1)).optional()
  })
  .strict();

export type DiagnosticsExportLogEntry = z.infer<typeof diagnosticsExportLogEntrySchema>;

export function parseDiagnosticsExportLogEntry(input: unknown): DiagnosticsExportLogEntry {
  return diagnosticsExportLogEntrySchema.parse(input);
}

export function createDiagnosticsExportLogEntry(
  entry: DiagnosticsExportLogEntry
): DiagnosticsExportLogEntry {
  return diagnosticsExportLogEntrySchema.parse(entry);
}

export interface DiagnosticsExportRequestPayload {
  accessibilityState?: DiagnosticsAccessibilityStateLog;
}

export function parseDiagnosticsExportRequestPayload(
  input: unknown
): DiagnosticsExportRequestPayload | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const candidate = input as DiagnosticsExportRequestPayload;
  if (candidate.accessibilityState === undefined) {
    return {};
  }

  const result = diagnosticsAccessibilityStateSchema.safeParse(candidate.accessibilityState);
  if (!result.success) {
    return {};
  }

  return { accessibilityState: result.data };
}
