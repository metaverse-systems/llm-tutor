export interface DiagnosticsConfig {
  storageDir: string | null;
  retentionDays: number;
  warningThresholdMb: number;
}

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_WARNING_THRESHOLD_MB = 500;

function parseNumber(envValue: string | undefined, fallback: number): number {
  if (!envValue) {
    return fallback;
  }

  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadDiagnosticsConfig(env: NodeJS.ProcessEnv = process.env): DiagnosticsConfig {
  return {
    storageDir: env.DIAGNOSTICS_STORAGE_DIR?.trim() || null,
    retentionDays: parseNumber(env.DIAGNOSTICS_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    warningThresholdMb: parseNumber(env.DIAGNOSTICS_WARNING_THRESHOLD_MB, DEFAULT_WARNING_THRESHOLD_MB),
  };
}
