# Data Model – Foundational Workspace & Diagnostics Scaffold

## Entity: DiagnosticsSnapshot
- **Purpose**: Represents the most recent health picture of the local LLM Tutor runtime.
- **Fields**:
  | Field | Type | Description |
  |-------|------|-------------|
  | `id` | UUID | Unique identifier for each snapshot. |
  | `generatedAt` | ISO 8601 string | Timestamp when the backend produced the snapshot. |
  | `backendStatus` | enum(`"running"`, `"stopped"`, `"error"`) | Current lifecycle state of the Node backend child process. |
  | `backendMessage` | string | Human-readable message or error summary for maintainers. |
  | `rendererUrl` | string | URL the renderer is currently serving (dev server or packaged file). |
  | `llmStatus` | enum(`"connected"`, `"unreachable"`, `"disabled"`) | Result of the llama.cpp health probe. |
  | `llmEndpoint` | string | Host/port that was probed (empty when disabled). |
  | `activePreferences` | `AccessibilityPreference` | Snapshot of the active accessibility toggles. |
  | `logDirectory` | string | Absolute path to the diagnostics storage folder. |
  | `snapshotCountLast30d` | number | Number of snapshots retained within the last 30 days. |
  | `diskUsageBytes` | number | Current disk usage (bytes) for diagnostics artifacts. |
  | `warnings` | string[] | Any actionable warnings (e.g., "Disk usage above 500MB"). |

- **Relationships**: Embeds `AccessibilityPreference`; references recent `ProcessHealthEvent` records when generating warnings.

## Entity: AccessibilityPreference
- **Purpose**: Stores the learner/maintainer accessibility choices that must persist across sessions.
- **Fields**:
  | Field | Type | Description |
  |-------|------|-------------|
  | `highContrast` | boolean | Enables high-contrast theme when true. |
  | `reduceMotion` | boolean | Disables animated transitions when true. |
  | `updatedAt` | ISO 8601 string | Timestamp of the most recent change. |

- **Relationships**: Associated one-to-one with the local OS user profile; embedded inside each `DiagnosticsSnapshot`.

## Entity: ProcessHealthEvent
- **Purpose**: Captures lifecycle transitions of the backend child process for transparency and debugging.
- **Fields**:
  | Field | Type | Description |
  |-------|------|-------------|
  | `id` | UUID | Unique identifier for the event. |
  | `occurredAt` | ISO 8601 string | Timestamp when the event occurred. |
  | `type` | enum(`"spawn"`, `"exit"`, `"crash"`, `"restart"`) | Indicates the lifecycle change. |
  | `exitCode` | number \| null | Exit code when applicable. |
  | `reason` | string | Human-readable reason (e.g., "Process exited unexpectedly"). |

- **Relationships**: Stored alongside snapshots within the diagnostics archive; the latest events influence `DiagnosticsSnapshot.backendStatus` and warning generation.

## Cross-Entity Notes
- `DiagnosticsSnapshot` and `ProcessHealthEvent` share the same retention policy (30 days) and disk budget (500 MB for combined artifacts).
- Accessibility preferences act as configuration inputs when generating new snapshots, ensuring the diagnostics view accurately reflects UI state.
- All entities remain local to the learner’s machine—no remote persistence or telemetry is permitted for this feature.
