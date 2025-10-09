import { describe, it, expect } from "vitest";

interface DiagnosticsSchemasModule {
  diagnosticsSnapshotSchema?: {
    parse: (input: unknown) => unknown;
    safeParse: (input: unknown) => {
      success: boolean;
      error?: { issues: readonly { path: (string | number)[] }[] };
    };
  };
  diagnosticsPreferenceRecordSchema?: {
    safeParse: (input: unknown) => { success: boolean };
  };
  processHealthEventSchema?: {
    safeParse: (input: unknown) => { success: boolean };
  };
  parseDiagnosticsSnapshot?: (input: unknown) => DiagnosticsSnapshotDomain;
}

interface DiagnosticsSnapshotDomain {
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
  warnings?: string[];
  activePreferences: {
    highContrastEnabled: boolean;
    reducedMotionEnabled: boolean;
    remoteProvidersEnabled: boolean;
    lastUpdatedAt: Date;
    updatedBy: "renderer" | "backend" | "main";
    consentSummary: string;
    consentEvents: unknown[];
    storageHealth: unknown;
  };
}

const validSnapshotFixture = {
  id: "a913d0f4-13c9-4d39-9154-fc6a0f0c1f7c",
  generatedAt: "2025-10-07T10:00:00.000Z",
  backendStatus: "running",
  backendMessage: "Backend online",
  rendererUrl: "http://localhost:5173",
  llmStatus: "disabled",
  llmEndpoint: "",
  logDirectory: "/tmp/llm-tutor/diagnostics",
  snapshotCountLast30d: 12,
  diskUsageBytes: 128_000,
  warnings: ["Storage at 25%"],
  activePreferences: {
    highContrastEnabled: true,
    reducedMotionEnabled: false,
    remoteProvidersEnabled: false,
    lastUpdatedAt: "2025-10-07T09:58:00.000Z",
    updatedBy: "main",
    consentSummary: "Remote providers are disabled",
    consentEvents: [
      {
        eventId: "a5fcb02b-80ad-4b2c-a9a3-6750f7f9b4c4",
        occurredAt: "2025-10-07T09:00:00.000Z",
  actor: "learner",
  previousState: "enabled",
  nextState: "disabled",
        noticeVersion: "v1.0",
        channel: "ui-toggle"
      }
    ],
    storageHealth: {
      status: "unavailable",
      reason: "permission-denied",
      message: "Preferences vault is temporarily unavailable",
      detectedAt: "2025-10-07T09:57:00.000Z",
      recommendedAction: "Check file permissions for the preferences directory and retry.",
      retryAvailableAt: null
    }
  }
};

describe("Shared diagnostics schemas", () => {
  it("validates diagnostics snapshot payloads per contract", async () => {
    const module = (await import("../index")) as DiagnosticsSchemasModule;
    const snapshotSchema = module.diagnosticsSnapshotSchema;

    expect(snapshotSchema, "Expected diagnosticsSnapshotSchema to be exported from packages/shared/src/diagnostics/index.ts").toBeDefined();
    if (!snapshotSchema) {
      throw new Error("diagnosticsSnapshotSchema must exist to validate diagnostics contract");
    }

    const result = snapshotSchema.safeParse(validSnapshotFixture);
    expect(result.success).toBe(true);

    const invalidResult = snapshotSchema.safeParse({ ...validSnapshotFixture, backendStatus: "offline" });
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error?.issues[0]?.path).toContain("backendStatus");
  });

  it("parses diagnostics snapshots into strong domain objects", async () => {
    const module = (await import("../index")) as DiagnosticsSchemasModule;
    const parseDiagnosticsSnapshot = module.parseDiagnosticsSnapshot;

    expect(parseDiagnosticsSnapshot, "Expected parseDiagnosticsSnapshot utility to be exported").toBeTypeOf("function");

    const parsed = parseDiagnosticsSnapshot!(validSnapshotFixture);
    expect(parsed.generatedAt).toBeInstanceOf(Date);
  expect(parsed.activePreferences.lastUpdatedAt).toBeInstanceOf(Date);
    expect(parsed.backendStatus).toBe("running");
  });

  it("surfaces schema helpers for preference records and process events", async () => {
    const module = (await import("../index")) as DiagnosticsSchemasModule;

  expect(module.diagnosticsPreferenceRecordSchema, "Expected diagnosticsPreferenceRecordSchema export").toBeDefined();
    expect(module.processHealthEventSchema, "Expected processHealthEventSchema export").toBeDefined();

    const preferenceSchema = module.diagnosticsPreferenceRecordSchema;
    const processSchema = module.processHealthEventSchema;

    if (!preferenceSchema || !processSchema) {
      throw new Error("Shared diagnostics schemas missing dependency exports");
    }

    const preferenceResult = preferenceSchema.safeParse({
      id: "55d4ea73-69d9-4556-9129-efb1f5217f2e",
      highContrastEnabled: false,
      reducedMotionEnabled: true,
      remoteProvidersEnabled: true,
      lastUpdatedAt: "2025-10-07T09:30:00.000Z",
      updatedBy: "renderer",
      consentSummary: "Remote providers enabled",
      consentEvents: [
        {
          eventId: "d5bfaf58-1c88-42f2-9a36-4c2ce5f26b11",
          occurredAt: "2025-10-07T09:28:00.000Z",
          actor: "learner",
          previousState: "disabled",
          nextState: "enabled",
          noticeVersion: "v1.0",
          channel: "ui-toggle"
        }
      ],
      storageHealth: null
    });
    expect(preferenceResult.success).toBe(true);

    const processResult = processSchema.safeParse({
      id: "576ebf9c-1563-431e-af36-9b3a3f6b27b7",
      occurredAt: "2025-10-07T08:59:00.000Z",
      type: "spawn",
      exitCode: null,
      reason: "Desktop boot sequence"
    });
    expect(processResult.success).toBe(true);
  });
});
