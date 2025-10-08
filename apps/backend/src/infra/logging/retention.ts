const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DiagnosticsSnapshotFile {
  id: string;
  path: string;
  generatedAt: string;
  sizeBytes: number;
}

export interface DiagnosticsRetentionConfig {
  maxAgeDays: number;
  warningThresholdBytes: number;
}

export interface DiagnosticsRetentionOptions {
  now: Date;
  config: DiagnosticsRetentionConfig;
  listSnapshots: () => Promise<DiagnosticsSnapshotFile[]>;
  deleteSnapshot: (file: DiagnosticsSnapshotFile) => Promise<void>;
  emitWarning: (message: string) => Promise<void>;
}

export interface DiagnosticsRetentionResult {
  diskUsageBytes: number;
  prunedSnapshotIds: string[];
  warnings: string[];
}

function isOlderThanRetentionWindow(
  file: DiagnosticsSnapshotFile,
  now: Date,
  maxAgeDays: number
): boolean {
  const generatedAt = new Date(file.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return false;
  }

  const ageMs = now.getTime() - generatedAt.getTime();
  return ageMs > maxAgeDays * MS_PER_DAY;
}

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(0)} MB`;
}

export async function enforceDiagnosticsRetention(
  options: DiagnosticsRetentionOptions
): Promise<DiagnosticsRetentionResult> {
  const { now, config, listSnapshots, deleteSnapshot, emitWarning } = options;
  const snapshots = await listSnapshots();

  const prunedSnapshotIds: string[] = [];
  const keptSnapshots: DiagnosticsSnapshotFile[] = [];

  for (const snapshot of snapshots) {
    if (isOlderThanRetentionWindow(snapshot, now, config.maxAgeDays)) {
      await deleteSnapshot(snapshot);
      prunedSnapshotIds.push(snapshot.id);
    } else {
      keptSnapshots.push(snapshot);
    }
  }

  const diskUsageBytes = keptSnapshots.reduce((total, file) => total + Math.max(0, file.sizeBytes), 0);

  const warnings: string[] = [];
  if (diskUsageBytes > config.warningThresholdBytes) {
    const message = `Diagnostics storage has reached ${formatMegabytes(diskUsageBytes)}, exceeding the ${formatMegabytes(config.warningThresholdBytes)} threshold.`;
    warnings.push(message);
    await emitWarning(message);
  }

  return {
    diskUsageBytes,
    prunedSnapshotIds,
    warnings
  };
}
