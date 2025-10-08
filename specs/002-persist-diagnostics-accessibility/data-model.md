# Data Model – Persistent Diagnostics Preference Vault

## DiagnosticsPreferenceRecord
| Field | Type | Description | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Stable identifier for the preference vault entry | Single record (`prefs-default`) but UUID keeps parity with exports |
| `highContrastEnabled` | boolean | Whether high-contrast styling is enforced across renderer surfaces | Defaults to `false`; toggled from diagnostics panel |
| `reducedMotionEnabled` | boolean | Whether motion-reduced animations are requested globally | Defaults to `false`; applies to renderer + Electron dialogs |
| `remoteProvidersEnabled` | boolean | Learner consent flag for remote LLM connectivity | Defaults to `false`; requires explicit confirmation copy |
| `lastUpdatedAt` | ISO datetime string | Timestamp of the most recent persisted change | Written by main process immediately after successful save |
| `updatedBy` | enum(`"renderer"`, `"backend"`, `"main"`) | Originating process for audit trails | Renderer toggles pass through preload; backend forced updates only via migrations |
| `consentSummary` | string | Human-readable confirmation text shown during opt-in/out | Stored to surface in diagnostics exports |
| `consentEvents` | `ConsentEventLog[]` | Sliding window of recent consent changes | Maintains latest three entries in vault |
| `storageHealth` | `StorageHealthAlert | null` | Latest known storage warning | Null when vault behaves normally |

## ConsentEventLog
| Field | Type | Description | Notes |
| --- | --- | --- | --- |
| `eventId` | UUID | Unique identifier for the consent event | Helps deduplicate exports |
| `occurredAt` | ISO datetime string | When the consent action occurred | Always in UTC |
| `actor` | enum(`"learner"`, `"maintainer"`) | Who triggered the change | Maintainer events come from diagnostics modal |
| `previousState` | enum(`"disabled"`, `"enabled"`) | State before the action | `disabled` by default |
| `nextState` | enum(`"disabled"`, `"enabled"`) | State after the action | Must differ from `previousState` |
| `noticeVersion` | string | Version of consent language shown to the learner | Enables tracking when wording changes |
| `channel` | enum(`"ui-toggle"`, `"config-migration"`) | Originating channel | Migrations record only when remote providers remain opt-out |

## StorageHealthAlert
| Field | Type | Description | Notes |
| --- | --- | --- | --- |
| `status` | enum(`"ok"`, `"degraded"`, `"unavailable"`) | Overall health classification | `ok` state is not stored; `null` indicates healthy |
| `detectedAt` | ISO datetime string | Timestamp when the issue was detected | Derived from main process error handling |
| `reason` | enum(`"permission-denied"`, `"disk-full"`, `"corrupted"`, `"unknown"`) | Primary failure reason | Drives remediation messaging |
| `message` | string | Learner-friendly explanation of the problem | Presented verbatim in diagnostics panel |
| `recommendedAction` | string | Next steps to resolve the issue | e.g., "Free disk space and retry" |
| `retryAvailableAt` | ISO datetime string | When the system will reattempt persistence automatically | Null when manual retry required |

## Relationships & Lifecycle
- `DiagnosticsPreferenceRecord` is a singleton persisted in the Electron main process vault and embedded into diagnostics snapshots (`DiagnosticsSnapshot.preferences`).
- `ConsentEventLog` entries are appended to the in-memory record; when more than three exist, the oldest entry is pushed into the diagnostics JSONL export and removed from the vault list.
- `StorageHealthAlert` is set by the main process upon persistence failure, surfaced via IPC to renderer, and cleared after the next successful save.

## Validation Rules
- Boolean toggles must be explicit `true/false`; no null values allowed.
- Consent transitions must flow `disabled → enabled → disabled`; repeated toggles to the same state are ignored.
- Storage health `message` strings must remain <240 characters to stay screen-reader friendly.
- All timestamps are recorded in ISO 8601 UTC and validated with Zod before persistence.
