import React, { useMemo } from "react";
import type { DiagnosticsSnapshotPayload } from "@metaverse-systems/llm-tutor-shared";

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
      return "diagnostics-panel__status diagnostics-panel__status--positive";
    case "negative":
      return "diagnostics-panel__status diagnostics-panel__status--negative";
    default:
      return "diagnostics-panel__status diagnostics-panel__status--neutral";
  }
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  snapshot,
  backend,
  warnings,
  isLoading,
  disableAnimations = false
}) => {
  const backendStatus = backend?.status ?? snapshot?.backendStatus ?? "stopped";
  const backendDescriptor = BACKEND_STATUS_LABELS[backendStatus];

  const llmStatus = snapshot?.llmStatus ?? "disabled";
  const llmDescriptor = LLM_STATUS_LABELS[llmStatus];

  const lastGeneratedLabel = formatTimestamp(snapshot?.generatedAt);
  const diskUsageLabel = formatBytes(snapshot?.diskUsageBytes);
  const logDirectory = snapshot?.logDirectory ?? "Local diagnostics directory unavailable";
  const snapshotCount = snapshot?.snapshotCountLast30d ?? 0;

  const preferenceSummary = snapshot?.activePreferences
    ? `${snapshot.activePreferences.highContrast ? "High contrast" : "Standard contrast"}, ${
        snapshot.activePreferences.reduceMotion ? "Reduced motion" : "Full motion"
      }`
    : "Using defaults";

  const combinedWarnings = useMemo(() => combineWarnings(snapshot, warnings), [snapshot, warnings]);

  const showAnimation = !disableAnimations && backendStatus === "running";

  return (
    <section
      data-testid="diagnostics-panel"
      className="diagnostics-panel"
      aria-labelledby="diagnostics-panel-heading"
    >
      <header className="diagnostics-panel__header">
        <h2 id="diagnostics-panel-heading">System diagnostics</h2>
        <p role="status" aria-live="polite">
          {isLoading ? "Loading latest status…" : `Last snapshot captured ${lastGeneratedLabel}.`}
        </p>
      </header>

      <div className="diagnostics-panel__grid" role="list">
        <article role="listitem" className="diagnostics-panel__card">
          <h3 className="diagnostics-panel__card-title">Backend status</h3>
          <p className={getToneClass(backendDescriptor.tone)}>{backendDescriptor.label}</p>
          {backend?.message ?? snapshot?.backendMessage ? (
            <p className="diagnostics-panel__card-meta">
              {backend?.message ?? snapshot?.backendMessage}
            </p>
          ) : null}
          {backend?.pid ? <p className="diagnostics-panel__card-meta">PID {backend.pid}</p> : null}
        </article>

        <article role="listitem" className="diagnostics-panel__card">
          <h3 className="diagnostics-panel__card-title">llama.cpp probe</h3>
          <p className={getToneClass(llmDescriptor.tone)}>{llmDescriptor.label}</p>
          {snapshot?.llmEndpoint ? (
            <p className="diagnostics-panel__card-meta">Endpoint: {snapshot.llmEndpoint}</p>
          ) : (
            <p className="diagnostics-panel__card-meta">No remote endpoint configured</p>
          )}
        </article>

        <article role="listitem" className="diagnostics-panel__card">
          <h3 className="diagnostics-panel__card-title">Log storage</h3>
          <p className="diagnostics-panel__status diagnostics-panel__status--neutral">{diskUsageLabel} used</p>
          <p className="diagnostics-panel__card-meta" aria-label="Diagnostics log directory">
            {logDirectory}
          </p>
          <p className="diagnostics-panel__card-meta">Snapshots (30d): {snapshotCount}</p>
        </article>

        <article role="listitem" className="diagnostics-panel__card">
          <h3 className="diagnostics-panel__card-title">Accessibility sync</h3>
          <p className="diagnostics-panel__status diagnostics-panel__status--neutral">{preferenceSummary}</p>
        </article>
      </div>

      {showAnimation ? (
        <div className="diagnostics-panel__pulse" data-animates="true" aria-hidden="true">
          <span className="diagnostics-panel__pulse-dot" />
          <span className="diagnostics-panel__pulse-ring" />
        </div>
      ) : null}

      <section className="diagnostics-panel__warnings" aria-live="polite" aria-label="Diagnostics warnings">
        {combinedWarnings.length > 0 ? (
          <ul>
            {combinedWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>No retention warnings in the last 30 days.</p>
        )}
      </section>
    </section>
  );
};

export default DiagnosticsPanel;
