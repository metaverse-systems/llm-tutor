import { describe, it, expect } from "vitest";

interface DiagnosticsSnapshotFile {
  id: string;
  path: string;
  generatedAt: string;
  sizeBytes: number;
}

interface DiagnosticsRetentionConfig {
  maxAgeDays: number;
  warningThresholdBytes: number;
}

interface DiagnosticsRetentionOptions {
  now: Date;
  config: DiagnosticsRetentionConfig;
  listSnapshots: () => Promise<DiagnosticsSnapshotFile[]>;
  deleteSnapshot: (file: DiagnosticsSnapshotFile) => Promise<void>;
  emitWarning: (message: string) => Promise<void>;
}

interface DiagnosticsRetentionResult {
  diskUsageBytes: number;
  prunedSnapshotIds: string[];
  warnings: string[];
}

interface DiagnosticsRetentionModule {
  enforceDiagnosticsRetention?: (
    options: DiagnosticsRetentionOptions
  ) => Promise<DiagnosticsRetentionResult>;
}

describe("Diagnostics retention policy", () => {
  it("removes snapshots older than the 30 day retention window", async () => {
    const module = (await import("../../src/infra/logging/index")) as DiagnosticsRetentionModule;
    const enforceRetention = module.enforceDiagnosticsRetention;

    expect(enforceRetention, "Expected enforceDiagnosticsRetention to be implemented in apps/backend/src/infra/logging").toBeTypeOf("function");

    const deleted: string[] = [];
    const emittedWarnings: string[] = [];
    const now = new Date("2025-10-07T12:00:00.000Z");

    const files: DiagnosticsSnapshotFile[] = [
      {
        id: "keep-recent",
        path: "/diagnostics/snapshots/recent.jsonl",
        generatedAt: "2025-10-01T15:30:00.000Z",
        sizeBytes: 25_000
      },
      {
        id: "prune-old",
        path: "/diagnostics/snapshots/old.jsonl",
        generatedAt: "2025-08-15T09:00:00.000Z",
        sizeBytes: 18_000
      }
    ];

    const result = await enforceRetention!({
      now,
      config: {
        maxAgeDays: 30,
        warningThresholdBytes: 500 * 1024 * 1024
      },
      listSnapshots: async () => files,
      deleteSnapshot: async (file) => {
        deleted.push(file.id);
      },
      emitWarning: async (message) => {
        emittedWarnings.push(message);
      }
    });

    expect(result.prunedSnapshotIds).toContain("prune-old");
    expect(deleted).toEqual(["prune-old"]);
    expect(result.prunedSnapshotIds).not.toContain("keep-recent");
    expect(result.diskUsageBytes).toBe(25_000);
    expect(result.warnings).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it("emits a disk usage warning when diagnostics storage exceeds 500MB", async () => {
    const module = (await import("../../src/infra/logging/index")) as DiagnosticsRetentionModule;
    const enforceRetention = module.enforceDiagnosticsRetention;

    expect(enforceRetention, "Expected enforceDiagnosticsRetention to be implemented in apps/backend/src/infra/logging").toBeTypeOf("function");

    const emittedWarnings: string[] = [];

    const result = await enforceRetention!({
      now: new Date("2025-10-07T12:00:00.000Z"),
      config: {
        maxAgeDays: 30,
        warningThresholdBytes: 500 * 1024 * 1024
      },
      listSnapshots: async () => [
        {
          id: "snapshot-a",
          path: "/diagnostics/snapshots/a.jsonl",
          generatedAt: "2025-10-06T18:42:00.000Z",
          sizeBytes: 320 * 1024 * 1024
        },
        {
          id: "snapshot-b",
          path: "/diagnostics/snapshots/b.jsonl",
          generatedAt: "2025-10-07T05:10:00.000Z",
          sizeBytes: 260 * 1024 * 1024
        }
      ],
      deleteSnapshot: async () => {
        // Disk usage should be handled via warnings instead of pruning when within retention window.
      },
      emitWarning: async (message) => {
        emittedWarnings.push(message);
      }
    });

    expect(result.diskUsageBytes).toBe(580 * 1024 * 1024);
    expect(result.prunedSnapshotIds).toEqual([]);
    expect(result.warnings).not.toHaveLength(0);
    expect(emittedWarnings).toEqual(result.warnings);
    expect(result.warnings[0]).toContain("500 MB");
  });
});
