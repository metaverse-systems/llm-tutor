# Data Model: Electron Diagnostics Export Automation

_Last updated: 2025-10-09_

## Overview
This document captures the finalized schema definitions backing the diagnostics export automation. Fields align with decisions in `plan.md`, `research.md`, and the shared TypeScript schemas in `packages/shared/src/diagnostics/export-log.ts`.

## Entities

### ExportVerificationLog
| Field | Type | Notes |
| --- | --- | --- |
| `timestamp` | ISO 8601 string (optional) | When the export automation completed. Populated automatically if missing. |
| `status` | Enum (`"success"`, `"failure"`) | Final outcome of the run. |
| `exportPath` | string (optional) | Absolute path to the saved snapshot (default `app.getPath("userData")/diagnostics/exports`). |
| `snapshotId` | string (optional) | Identifier aligned with backend snapshot naming. |
| `accessibilityState` | `AccessibilityStateLog` (optional) | Snapshot of toggle states enforced during automation. |
| `messages` | array<string> (optional) | Human-readable log lines surfaced during automation. |
| `storageAlerts` | array<string> (optional) | Filesystem or quota warnings encountered during export. |

### AccessibilityStateLog
| Field | Type | Notes |
| --- | --- | --- |
| `highContrastEnabled` | boolean (optional) | Indicates high contrast palette was active during export. |
| `reducedMotionEnabled` | boolean (optional) | Indicates motion reductions were enforced. |
| `remoteProvidersEnabled` | boolean (optional) | Reflects remote LLM provider opt-in state. |
| `keyboardNavigationVerified` | boolean (optional) | Confirms Playwright exercised keyboard navigation before export. |

### DiagnosticsExportSnapshot
| Field | Type | Notes |
| --- | --- | --- |
| `snapshotId` | string | Identifier aligned with backend diagnostics snapshot naming. |
| `generatedAt` | ISO 8601 string | Timestamp when backend reported the snapshot ready. |
| `payload` | JSON | Raw diagnostics data saved to JSONL during export. |
| `privacyBanner` | string | Learner-facing privacy message confirmed during export. |

## Relationships
- Each `ExportVerificationLog` references the `DiagnosticsExportSnapshot` created in the same run via `snapshotId`.
-- Logs and snapshots are stored side-by-side under the diagnostics exports directory with restrictive permissions (`0o700`).
- Accessibility state fields map directly to the JSONL log (`diagnostics-snapshot-export-*.log.jsonl`) documented in `docs/diagnostics.md`.

## Outstanding Questions
None. Schemas match the shipped implementation and shared library exports.
