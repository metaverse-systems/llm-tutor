# Diagnostics Runbook

## Purpose

This runbook explains how to validate, operate, and troubleshoot the diagnostics subsystem across the backend service, Electron main process, preload bridge, and renderer. It complements `docs/architecture.md` and the feature specifications under `specs/001-foundational-workspace-and/` and `specs/002-persist-diagnostics-accessibility/`.

## Golden Paths

1. **Prepare the workspace**
   - Install dependencies: `npm install`
   - Build shared artefacts: `npm run build --workspaces`
   - Generate theme tokens + CSS variables: `npm run build:tokens`
   - Optional consolidated check: `npm run lint` (runs linting, formatter check, token build, Tailwind builds, Vitest theme suites, and the Playwright high-contrast specs used in CI).
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
   - Verify the landing page and diagnostics window apply `data-theme="contrast"` and motion attributes (`data-motion="reduced"` when enabled) via the shared `ThemeModeProvider`.
   - Quit and relaunch the desktop shell; the stored preferences should hydrate immediately after preload initialisation.
5. **Simulate storage disruption**
   - Temporarily remove write access to `${app.getPath("userData")}/diagnostics-preferences.json` (see _Storage Failure Remediation_ below) or deliberately toggle the backend failure hook (`consentSummary = "Simulate storage failure"` via REST client in development).
   - Observe the renderer “session-only” alert, check `window.llmTutor.diagnostics.getState()` for a `storageHealth` payload, and clear the condition to verify auto-recovery.
6. **Validate export**
   - Trigger “Export snapshot”, save the JSONL archive, and confirm it contains the last generated snapshot with preference records, any storage health alerts, and appended `llm_*` diagnostics events from the sanitised `diagnostics-events.jsonl` log.

## Automation Workflow

### Playwright export harness

- Run the diagnostics export suite headlessly via `xvfb-run -a npx playwright test tests/e2e/diagnostics/export.spec.ts`.
- Set `NODE_OPTIONS=--import=tsx` so Playwright can load the TypeScript launcher utilities without precompiling.
- Enable `LLM_TUTOR_DIAGNOSTICS_LOG=1` during investigations to mirror export instrumentation to stderr; logs are prefixed with `[diagnostics-export]`.
- When debugging launcher arguments, add `DEBUG_ELECTRON_LAUNCH=1` to print the normalised Electron CLI payload.

### Theme alignment suites

- Run the high-contrast coverage suite inline with CI via `npm run lint`. To execute manually:

   ```bash
   npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend -- --grep "Unified theme high contrast accessibility"
   npx playwright test apps/desktop/tests/main/high-contrast.theme.spec.ts
   ```

- The desktop scenario relies on `apps/desktop/tests/tools/themeHarness.ts`, which bootstraps Electron with the shared `theme.css`, seeds high-contrast and reduced-motion preferences, and cleans up its temporary user-data directory after each run.
- Both harnesses expect freshly generated token artefacts (`npm run build:tokens`) so the renderer and diagnostics window can resolve semantic Tailwind classes.

### Remote debugging port resolution

- The launcher (`tests/e2e/tools/electron-launcher.cjs`) inspects the supplied `--remote-debugging-port` flag and guarantees a concrete value before spawning Electron.
- Provide a fixed port via `LLM_TUTOR_REMOTE_DEBUG_PORT=<port>` for reproducible captures (e.g., when proxying DevTools through a tunnel). Otherwise the launcher allocates an ephemeral port and exports it as `ELECTRON_REMOTE_DEBUGGING_PORT` for downstream tooling.
- Ports are retried up to three times to dodge collisions; allocation failures bubble a clear “Failed to allocate remote debugging port” error before Playwright starts the scenario.
- All remote-debug negotiations emit `remote-debugging-port` telemetry when `LLM_TUTOR_DIAGNOSTICS_LOG=1`, making it easy to confirm the active port without attaching DevTools.

### Export log capture

- Every export run prepares a JSONL log alongside the snapshot archive. By default logs live in `${app.getPath("userData")}/diagnostics/exports`, but if the user saves to `/path/to/run`, both the snapshot and log land there.
- Filenames follow `diagnostics-snapshot-export-<timestamp>.log.jsonl` (UTC, punctuation stripped) and include structured payloads for `outcome`, `snapshotPath`, `accessibilityState`, and failure metadata.
- Use the Playwright helper `ensureSnapshotAvailable` to wait for the log file; the scenario fails fast with a clear error if the log is missing after the configured timeout.
- Verify every export bundles the latest `diagnostics-events.jsonl` entries after the snapshot line. Expect `llm_profile_*`, `llm_autodiscovery`, `llm_test_prompt`, and `llm_profile_ipc` events when the corresponding workflows have run; each entry is stored without API keys or full endpoint URLs.
- The `llm_profile_ipc` events record diagnostic breadcrumbs for all profile IPC operations (list, create, update, delete, activate, test, discover) with correlation IDs, duration metrics, operator role, and safe storage status. These breadcrumbs are automatically included in diagnostics exports to enable performance analysis and troubleshooting.
- Keep the log directory private (mode `0700`) so the export pipeline retains learner-specific context without leaking between system users.

### Troubleshooting automation

- **Port still zero**: ensure no other launcher injected `--remote-debugging-port=0` after ours; purge cached Playwright traces and re-run with `DEBUG_ELECTRON_LAUNCH=1` to inspect the final args.
- **No export log written**: verify the destination directory is writable and that `apps/desktop/src/main/logging/exportLog.ts` can create files with mode `0600`. Re-run with `LLM_TUTOR_DIAGNOSTICS_LOG=1` to capture the failure reason.
- **Electron never exits under xvfb**: pass `timeout --preserve-status 180s` when running the suite to guarantee shutdown and review the logged `closeElectronApp` diagnostics.
- **Unexpected accessibility state**: confirm the renderer toggles were applied by inspecting the JSONL log’s `accessibilityState` values; the Playwright helper syncs toggles before exporting, so mismatches usually indicate a renderer crash.

## Operational Checks

| Scenario | Action | Expected Result |
| --- | --- | --- |
| Snapshot freshness | Renderer updates the timestamp at most every 30 s. | `lastUpdatedAt` reflects the latest backend refresh; state stays online. |
| Preference bootstrap | Launch diagnostics after quitting the desktop shell. | Vault hydrates within the first render; toggles match the stored record and `updatedBy` is `"main"`. |
| Manual refresh | Activate the “Refresh” button or call `window.llmTutor.diagnostics.refreshSnapshot()`. | Hook returns `{ success: true }`, merges warnings without duplicates, and keeps preference timestamps intact. |
| Backend offline | Stop backend process. | Renderer flips to offline mode, emits `ProcessHealthEvent`, and retry backoff (15 s default) kicks in. |
| Theme propagation | Toggle high contrast in the landing page. | `body` surfaces `data-theme="contrast"` in both browser and Electron contexts; semantic tokens update without flashing unstyled content. |
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
- **LLM Diagnostics Events** – `app.getPath("userData")/diagnostics/diagnostics-events.jsonl` capturing sanitised `llm_*` timeline entries that are appended to each export.
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
- High-contrast Playwright spec fails: regenerate tokens (`npm run build:tokens`), ensure `.tailwind` artefacts are up to date (`npm run tailwind:build -- --ci`), and re-run the suite with `LLM_TUTOR_DIAGNOSTICS_LOG=1` to confirm `ThemeHarness` is seeding preferences.

## Profile IPC Performance Monitoring

The diagnostics system automatically tracks performance metrics for all profile IPC operations:

- **Performance Budgets**: List operations must complete within 500ms (excluding remote network calls). Other operations are monitored but not budget-constrained.
- **Breadcrumb Recording**: Every IPC operation records a diagnostic breadcrumb containing channel, requestId, correlationId, operatorRole, durationMs, resultCode, and safeStorageStatus. These breadcrumbs are automatically written to `diagnostics-events.jsonl` and included in exports.
- **Performance Warnings**: When operations exceed their budget, the system emits a `performance-threshold-warning` event containing channel, durationMs, and budgetMs. These warnings can be monitored by the renderer or backend for alerting.
- **Correlation IDs**: Each breadcrumb includes a correlation ID (auto-generated UUID when not provided) that links IPC requests to service operations and diagnostics events, enabling full trace analysis across the stack.

To analyze performance:
1. Export diagnostics snapshot and filter for `"type": "llm_profile_ipc"` events
2. Review `durationMs` values against budgets (500ms for list operations)
3. Check for patterns in slow operations (e.g., large profile counts, encryption overhead)
4. Investigate any `TIMEOUT` result codes in breadcrumbs
5. Run performance regression tests: `npm test apps/desktop/tests/performance/profile-ipc.performance.spec.ts`

## Validation Checklist

- [ ] Backend contract tests pass (`apps/backend/tests/contract`)
- [ ] Integration retention test passes (`apps/backend/tests/integration`)
- [ ] Renderer hook unit tests pass (`apps/frontend/tests/unit`)
- [ ] Accessibility regression passes (`apps/frontend/tests/accessibility`)
- [ ] Electron export smoke passes (`tests/e2e/diagnostics`)
- [ ] Preference persistence Playwright scenario passes (`apps/frontend/tests/accessibility/diagnostics-persistence.spec.ts`)
- [ ] Desktop dev harness smoke confirms single-backend lock (`timeout --preserve-status 90s npm run dev --workspace @metaverse-systems/llm-tutor-desktop`)
- [ ] Reports archived under `docs/reports/diagnostics/`
