# Data Model: Electron Diagnostics Export Automation

_Last updated: 2025-10-09_

## Overview
This document captures the preliminary schema definitions that will guide the diagnostics export automation. Fields and structures should align with decisions in `plan.md` and `research.md`, and will be finalized after test scaffolding (T004–T008).

## Entities

### ExportVerificationLog
| Field | Type | Notes |
| --- | --- | --- |
| `timestamp` | ISO 8601 string | When the export automation completed (success or failure). |
| `status` | Enum (`"success"  `"failure"`) | Captures the final outcome of the run. |
| `exportPath` | string | Absolute path under `app.getPath("userData")/diagnostics/exports`. |
| `accessibilityState` | object | Snapshot of keyboard, high-contrast, and reduced-motion toggles. Fields may be omitted when values are not yet captured (e.g., keyboard verification pending). |
| `messages` | array<string> | Human-readable log lines surfaced during automation. |
| `storageAlerts` | array<string> | Warnings about filesystem permissions or disk availability. |

### DiagnosticsExportSnapshot
| Field | Type | Notes |
| --- | --- | --- |
| `snapshotId` | string | Identifier aligned with backend diagnostics snapshot naming. |
| `generatedAt` | ISO 8601 string | Timestamp when backend reported the snapshot ready. |
| `payload` | JSON | Raw diagnostics data saved to JSONL during export. |
| `privacyBanner` | string | Learner-facing privacy message confirmed during export. |

## Relationships
- Each `ExportVerificationLog` references the `DiagnosticsExportSnapshot` created in the same run via `snapshotId`.
- Logs and snapshots are stored side-by-side under the diagnostics exports directory with restrictive permissions (`0o700`).

## Outstanding Questions
- Define the precise shape of `accessibilityState` once Playwright assertions (T005, T015) are locked.
- Confirm whether additional retention metadata is needed for compliance before implementation (T012, T016).
