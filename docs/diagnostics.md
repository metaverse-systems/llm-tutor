# Diagnostics Runbook

## Purpose

This runbook explains how to validate, operate, and troubleshoot the diagnostics subsystem across the backend service, Electron main process, preload bridge, and renderer. It complements `docs/architecture.md` and the feature specifications under `specs/001-foundational-workspace-and/` and `specs/002-persist-diagnostics-accessibility/`.

## Golden Paths

1. **Prepare the workspace**
   - Install dependencies: `npm install`
   - Build shared artefacts: `npm run build --workspaces`
2. **Launch the stack in development**
   - Backend: `npm run dev --workspace @metaverse-systems/llm-tutor-backend`
   - Frontend: `npm run dev --workspace @metaverse-systems/llm-tutor-frontend`
   - Desktop shell: `npm run dev --workspace @metaverse-systems/llm-tutor-desktop`
3. **Open diagnostics**
   - Use the “Diagnostics” call-to-action on the landing page or `Ctrl/Cmd+D` to open the panel.
   - Verify backend status, llama.cpp probe, disk usage, retention warnings, and preference toggles render from the persisted vault.
4. **Exercise the preference vault**
   - Toggle high contrast, reduced motion, and remote provider controls.
   - Confirm the banner updates without forcing a snapshot refresh and that the consent summary reflects the latest event.
   - Quit and relaunch the desktop shell; the stored preferences should hydrate immediately after preload initialisation.
5. **Simulate storage disruption**
   - Temporarily remove write access to `${app.getPath("userData")}/diagnostics-preferences.json` (see _Storage Failure Remediation_ below) or deliberately toggle the backend failure hook (`consentSummary = "Simulate storage failure"` via REST client in development).
   - Observe the renderer “session-only” alert, check `window.llmTutor.diagnostics.getState()` for a `storageHealth` payload, and clear the condition to verify auto-recovery.
6. **Validate export**
   - Trigger “Export snapshot”, save the JSONL archive, and confirm it contains the last generated snapshot with preference records and any storage health alerts.

## Operational Checks

| Scenario | Action | Expected Result |
| --- | --- | --- |
| Snapshot freshness | Renderer updates the timestamp at most every 30 s. | `lastUpdatedAt` reflects the latest backend refresh; state stays online. |
| Preference bootstrap | Launch diagnostics after quitting the desktop shell. | Vault hydrates within the first render; toggles match the stored record and `updatedBy` is `"main"`. |
| Manual refresh | Activate the “Refresh” button or call `window.llmTutor.diagnostics.refreshSnapshot()`. | Hook returns `{ success: true }`, merges warnings without duplicates, and keeps preference timestamps intact. |
| Backend offline | Stop backend process. | Renderer flips to offline mode, emits `ProcessHealthEvent`, and retry backoff (15 s default) kicks in. |
| Disk pressure | Inject >500 MB of JSONL data under `${app.getPath("userData")}/diagnostics`. | Retention warning banner renders; warning persists until disk usage falls below threshold. |
| Preference vault unavailable | Remove write permissions from `diagnostics-preferences.json` and toggle a control. | Renderer shows a session-only warning, backend replies `503` with a `StorageHealthAlert`, and events still queue locally. |
| Retention pruning | Seed snapshots older than 30 days and run `npm run test --workspace @metaverse-systems/llm-tutor-backend`. | Integration test prunes old files and records warnings. |

## Preference Vault Workflow

The Electron main process owns the diagnostics preference vault using `electron-store`. During bootstrap it seeds a `DiagnosticsPreferenceRecord` (defaults to renderer-safe values) and publishes the payload through IPC. Updates follow this flow:

1. Renderer invokes `window.llmTutor.diagnostics.updatePreferences()` with optimistic state applied immediately to avoid UI flicker.
2. The backend proxy validates the payload, forwards it to the main-process vault, and enforces optimistic concurrency via `expectedLastUpdatedAt`.
3. Successful writes persist to `diagnostics-preferences.json`, broadcast `diagnostics:preferences:updated`, and refresh the diagnostics snapshot asynchronously.
4. Failures emit a `StorageHealthAlert` containing reason, remediation, and the time the write failed. The renderer keeps session toggles but surfaces a “session-only” banner until the alert clears.

Vault updates append consent events to the record. The backend snapshot service includes these events, ensuring exports provide a full timeline of opt-in/out decisions.

## Remote LLM Opt-In

1. Open Diagnostics → “LLM Connectivity”.
2. Toggle the remote provider switch; review the consent dialog summarizing endpoints and data usage.
3. Confirm to persist the choice (stored locally via the preference vault; no remote calls happen until opt-in succeeds).
4. Revoke access by toggling off; a consent event is appended to the vault and exports capture the timeline.

## Data Locations

- **Snapshots** – `app.getPath("userData")/diagnostics/*.jsonl`
- **Retention Logs** – JSONL records appended alongside snapshots with `type: "retention-warning"` events.
- **Exports** – User-selected directory determined via Electron’s save dialog.
- **Preferences** – `app.getPath("userData")/diagnostics-preferences.json` managed by `electron-store`; includes consent log and storage health metadata.
- **Storage alerts** – Inline with the preference record’s `storageHealth` field; also mirrored inside the latest diagnostics snapshot.

## Storage Failure Remediation

1. **Detect the alert** – The renderer shows a “settings will apply for this session only” banner, `window.llmTutor.diagnostics.getState()` returns a `storageHealth` payload, and backend `GET /internal/diagnostics/preferences` responds with HTTP 503.
2. **Verify filesystem state** – Inspect `${app.getPath("userData")}/diagnostics-preferences.json`. If the file is read-only, restore permissions (`chmod u+w`). If the directory is full, free disk space. If the file is corrupted, delete it—the vault re-seeds on next launch.
3. **Retry the update** – Toggle a preference again. On success the alert clears automatically and the vault writes a new `lastUpdatedAt` timestamp.
4. **Escalate if persistent** – Capture Electron console output, the latest snapshot export, and the `diagnostics-preferences.json` contents (if readable) before filing an issue.

## Consent Audit Trail

- Preference updates append to `consentEvents` within the vault. Each event stores the decision (`opted-in`, `opted-out`), the acting surface (`renderer` or `backend`), and the timestamp.
- Diagnostics snapshots embed the full consent log under `preferences.consentEvents`. When exporting JSONL archives, search for `"type": "diagnostics-preferences"` records to view the latest consent history.
- Support agents can confirm compliance by comparing the exported timeline with the renderer UI summary (`data-testid="diagnostics-consent-summary"`). Any discrepancy suggests a pending write that failed while storage health was degraded.

## Troubleshooting

- Run backend diagnostics suite: `npm run test --workspace @metaverse-systems/llm-tutor-backend -- diagnostics`
- Rebuild desktop bundle: `npm run build --workspace @metaverse-systems/llm-tutor-desktop`
- Clear local diagnostics: delete the diagnostics directory, remove `diagnostics-preferences.json`, and trigger a manual refresh.
- Inspect storage health: call `window.llmTutor.diagnostics.getState()` and review the `storageHealth` payload; fix filesystem permissions, free disk space, or delete the corrupted vault file before retrying the update.
- Collect logs for support: export snapshots, capture the latest validation summary (e.g., `docs/reports/diagnostics/2025-10-08-validation.md`), and attach to the support ticket.
- Trace Playwright persistence failures without hanging the shell: wrap debug runs with a timeout (e.g., `timeout --preserve-status 180s PWDEBUG=console npx playwright test tests/accessibility/diagnostics-persistence.spec.ts --grep "persists accessibility"`) so the interactive inspector exits automatically.

## Validation Checklist

- [ ] Backend contract tests pass (`apps/backend/tests/contract`)
- [ ] Integration retention test passes (`apps/backend/tests/integration`)
- [ ] Renderer hook unit tests pass (`apps/frontend/tests/unit`)
- [ ] Accessibility regression passes (`apps/frontend/tests/accessibility`)
- [ ] Electron export smoke passes (`tests/e2e/diagnostics`)
- [ ] Preference persistence Playwright scenario passes (`apps/frontend/tests/accessibility/diagnostics-persistence.spec.ts`)
- [ ] Desktop dev harness smoke confirms single-backend lock (`timeout --preserve-status 90s npm run dev --workspace @metaverse-systems/llm-tutor-desktop`)
- [ ] Reports archived under `docs/reports/diagnostics/`
