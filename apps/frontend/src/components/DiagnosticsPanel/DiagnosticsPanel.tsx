import type {
  DiagnosticsSnapshotPayload,
  DiagnosticsPreferenceRecordPayload,
  StorageHealthAlertPayload
} from "@metaverse-systems/llm-tutor-shared";
import React, { useMemo } from "react";

interface BackendProcessStatePayload {
  status: "stopped" | "starting" | "running" | "error";
  message?: string;
  pid?: number;
  lastExitCode?: number | null;
  lastExitSignal?: string | null;
  updatedAt: string;
}

interface DiagnosticsPanelProps {
  snapshot: DiagnosticsSnapshotPayload | null;
  backend: BackendProcessStatePayload | null;
  warnings: string[];
  isLoading: boolean;
  disableAnimations?: boolean;
  preferences?: DiagnosticsPreferenceRecordPayload | null;
  storageHealth?: StorageHealthAlertPayload | null;
}

interface StatusDescriptor {
  label: string;
  tone: "positive" | "neutral" | "negative";
}

const BACKEND_STATUS_LABELS: Record<BackendProcessStatePayload["status"], StatusDescriptor> = {
  running: { label: "Backend running", tone: "positive" },
  starting: { label: "Backend starting", tone: "neutral" },
  stopped: { label: "Backend stopped", tone: "negative" },
  error: { label: "Backend error", tone: "negative" }
};

const LLM_STATUS_LABELS: Record<DiagnosticsSnapshotPayload["llmStatus"], StatusDescriptor> = {
  connected: { label: "llama.cpp connected", tone: "positive" },
  unreachable: { label: "llama.cpp unreachable", tone: "negative" },
  disabled: { label: "llama.cpp disabled", tone: "neutral" }
};

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return "Unknown";
  }
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return "Not yet generated";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not yet generated";
  }
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    return formatter.format(date);
  } catch (error) {
    console.warn("Unable to format diagnostics timestamp", error);
    return date.toLocaleString();
  }
}

function describeUpdatedBy(updatedBy: DiagnosticsPreferenceRecordPayload["updatedBy"] | null | undefined): string {
  switch (updatedBy) {
    case "renderer":
      return "Updated from this screen";
    case "backend":
      return "Updated by diagnostics backend";
    case "main":
      return "Updated by desktop shell";
    default:
      return "Last change origin unknown";
  }
}

function describeConsentEvent(event: DiagnosticsPreferenceRecordPayload["consentEvents"][number]): string {
  const direction = event.nextState === "enabled" ? "Enabled" : "Disabled";
  const actor = event.actor === "learner" ? "Learner" : "Maintainer";
  const when = formatTimestamp(event.occurredAt);
  return `${direction} remote providers • ${actor} • ${when}`;
}

function formatStorageReason(reason: StorageHealthAlertPayload["reason"] | null | undefined): string {
  switch (reason) {
    case "permission-denied":
      return "Storage permission denied";
    case "disk-full":
      return "Disk appears full";
    case "corrupted":
      return "Storage corrupted";
    case "unknown":
      return "Storage degraded";
    default:
      return "Storage warning";
  }
}

function combineWarnings(snapshot: DiagnosticsSnapshotPayload | null, warnings: string[]): string[] {
  const aggregated = new Set<string>();
  if (snapshot?.warnings) {
    for (const warning of snapshot.warnings) {
      if (warning) {
        aggregated.add(warning);
      }
    }
  }
  for (const warning of warnings) {
    if (warning) {
      aggregated.add(warning);
    }
  }
  return Array.from(aggregated);
}

function getToneClass(tone: StatusDescriptor["tone"]): string {
  switch (tone) {
    case "positive":
      return "app-status--positive";
    case "negative":
      return "app-status--negative";
    default:
      return "app-status--neutral";
  }
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  snapshot,
  backend,
  warnings,
  isLoading,
  disableAnimations = false,
  preferences,
  storageHealth
}) => {
  const backendStatus = backend?.status ?? snapshot?.backendStatus ?? "stopped";
  const backendDescriptor = BACKEND_STATUS_LABELS[backendStatus];

  const llmStatus = snapshot?.llmStatus ?? "disabled";
  const llmDescriptor = LLM_STATUS_LABELS[llmStatus];

  const lastGeneratedLabel = formatTimestamp(snapshot?.generatedAt);
  const diskUsageLabel = formatBytes(snapshot?.diskUsageBytes);
  const logDirectory = snapshot?.logDirectory ?? "Local diagnostics directory unavailable";
  const snapshotCount = snapshot?.snapshotCountLast30d ?? 0;

  const effectivePreferences: DiagnosticsPreferenceRecordPayload | null =
    preferences ?? snapshot?.activePreferences ?? null;

  const preferenceSummary = effectivePreferences
    ? `${effectivePreferences.highContrastEnabled ? "High contrast" : "Standard contrast"}, ${
        effectivePreferences.reducedMotionEnabled ? "Reduced motion" : "Full motion"
      }`
    : "Using defaults";

  const consentSummary = effectivePreferences?.consentSummary ?? "Remote providers are disabled";
  const remoteProvidersEnabled = effectivePreferences?.remoteProvidersEnabled ?? false;

  const storageAlert: StorageHealthAlertPayload | null = storageHealth ?? effectivePreferences?.storageHealth ?? null;
  const showStorageAlert = storageAlert && storageAlert.status !== "ok";

  const preferenceUpdatedAtLabel = effectivePreferences?.lastUpdatedAt
    ? formatTimestamp(effectivePreferences.lastUpdatedAt)
    : "No saved changes yet";
  const preferenceUpdatedByLabel = describeUpdatedBy(effectivePreferences?.updatedBy);

  const consentHistory = useMemo(() => {
    if (!effectivePreferences?.consentEvents?.length) {
      return [];
    }
    return effectivePreferences.consentEvents
      .filter(event => typeof event.occurredAt === "string" && !isNaN(Date.parse(event.occurredAt)))
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 3)
      .map((event) => ({ id: event.eventId, label: describeConsentEvent(event) }));
  }, [effectivePreferences]);

  const combinedWarnings = useMemo(() => combineWarnings(snapshot, warnings), [snapshot, warnings]);

  const showAnimation = !disableAnimations && backendStatus === "running";

  return (
    <section
      data-testid="diagnostics-panel"
      className="app-card app-stack-lg"
      aria-labelledby="diagnostics-panel-heading"
    >
      <header className="app-stack-sm">
        <h2 id="diagnostics-panel-heading" className="text-heading font-heading text-text-primary">
          System diagnostics
        </h2>
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          {isLoading ? "Loading latest status…" : `Last snapshot captured ${lastGeneratedLabel}.`}
        </p>
      </header>

      <div className="app-grid-responsive" role="list">
        <article
          role="listitem"
          className="flex flex-col gap-spacing-sm rounded-radius-md border border-border-subtle bg-surface-elevated p-spacing-md shadow-sm"
        >
          <h3 className="text-heading font-heading text-text-primary">Backend status</h3>
          <p className={getToneClass(backendDescriptor.tone)}>{backendDescriptor.label}</p>
          {backend?.message ?? snapshot?.backendMessage ? (
            <p className="text-sm text-text-muted">
              {backend?.message ?? snapshot?.backendMessage}
            </p>
          ) : null}
          {backend?.pid ? <p className="text-sm text-text-muted">PID {backend.pid}</p> : null}
        </article>

        <article
          role="listitem"
          className="flex flex-col gap-spacing-sm rounded-radius-md border border-border-subtle bg-surface-elevated p-spacing-md shadow-sm"
        >
          <h3 className="text-heading font-heading text-text-primary">llama.cpp probe</h3>
          <p className={getToneClass(llmDescriptor.tone)}>{llmDescriptor.label}</p>
          {snapshot?.llmEndpoint ? (
            <p className="text-sm text-text-muted">Endpoint: {snapshot.llmEndpoint}</p>
          ) : (
            <p className="text-sm text-text-muted">No remote endpoint configured</p>
          )}
        </article>

        <article
          role="listitem"
          className="flex flex-col gap-spacing-sm rounded-radius-md border border-border-subtle bg-surface-elevated p-spacing-md shadow-sm"
        >
          <h3 className="text-heading font-heading text-text-primary">Log storage</h3>
          <p className="app-status--neutral">{diskUsageLabel} used</p>
          <p className="text-sm text-text-muted" aria-label="Diagnostics log directory">
            {logDirectory}
          </p>
          <p className="text-sm text-text-muted">Snapshots (30d): {snapshotCount}</p>
        </article>

        <article
          role="listitem"
          className="flex flex-col gap-spacing-sm rounded-radius-md border border-border-subtle bg-surface-elevated p-spacing-md shadow-sm"
        >
          <h3 className="text-heading font-heading text-text-primary">Accessibility sync</h3>
          <p className="app-status--neutral">{preferenceSummary}</p>
          <p className="text-sm text-text-muted">
            Remote providers: {remoteProvidersEnabled ? "Enabled" : "Disabled"}
          </p>
          <p
            className="text-sm text-text-muted"
            data-testid="diagnostics-consent-summary"
            aria-live="polite"
          >
            {consentSummary}
          </p>
          <p className="text-sm text-text-muted">{preferenceUpdatedAtLabel}</p>
          <p className="text-sm text-text-muted">{preferenceUpdatedByLabel}</p>
          {consentHistory.length > 0 ? (
            <ul className="flex flex-col gap-spacing-2xs text-sm text-text-muted" aria-label="Recent consent changes">
              {consentHistory.map((event) => (
                <li key={event.id}>{event.label}</li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>

      {showAnimation ? (
        <div className="flex items-center gap-spacing-xs text-state-success" aria-hidden="true">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-state-success/40 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-state-success" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Live updates
          </span>
        </div>
      ) : null}

      {showStorageAlert ? (
        <aside
          className="app-alert app-stack-sm"
          role="alert"
          aria-live="assertive"
          data-testid="diagnostics-storage-panel-alert"
        >
          <h3 className="text-heading font-heading text-text-primary">Preference storage issue</h3>
          <p>{storageAlert?.message}</p>
          <p className="text-sm text-text-muted">
            {formatStorageReason(storageAlert?.reason)} • Detected {formatTimestamp(storageAlert?.detectedAt ?? null)}
          </p>
          {storageAlert?.recommendedAction ? <p>{storageAlert.recommendedAction}</p> : null}
          {storageAlert?.retryAvailableAt ? (
            <p className="text-sm text-text-muted">
              Retry available {formatTimestamp(storageAlert.retryAvailableAt)}
            </p>
          ) : null}
          <p className="text-sm text-text-muted">
            These settings will apply for this session only until storage is restored. Recent changes may not persist.
          </p>
        </aside>
      ) : null}

      <section className="app-card app-card--muted app-stack-sm" aria-live="polite" aria-label="Diagnostics warnings">
        {combinedWarnings.length > 0 ? (
          <ul className="flex flex-col gap-spacing-2xs text-sm text-text-primary">
            {combinedWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No retention warnings in the last 30 days.</p>
        )}
      </section>
    </section>
  );
};

export default DiagnosticsPanel;
