# Diagnostics Runbook

## Purpose

This runbook explains how to validate, operate, and troubleshoot the diagnostics subsystem across the backend service, Electron main process, preload bridge, and renderer. It complements `docs/architecture.md` and the feature specifications under `specs/001-foundational-workspace-and/`.

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
   - Verify backend status, llama.cpp probe, disk usage, and retention warnings render.
4. **Validate export**
   - Trigger “Export snapshot”, save the JSONL archive, and confirm it contains the last generated snapshot with preferences embedded.

## Operational Checks

| Scenario | Action | Expected Result |
| --- | --- | --- |
| Snapshot freshness | Renderer updates the timestamp at most every 30 s. | `lastUpdatedAt` reflects the latest backend refresh; state stays online. |
| Manual refresh | Activate the “Refresh” button or call `window.llmTutor.diagnostics.refreshSnapshot()`. | Hook returns `{ success: true }` and merges warnings without duplicates. |
| Backend offline | Stop backend process. | Renderer flips to offline mode, emits `ProcessHealthEvent`, and retry backoff (15 s default) kicks in. |
| Disk pressure | Inject >500 MB of JSONL data under `${app.getPath("userData")}/diagnostics`. | Retention warning banner renders; warning persists until disk usage falls below threshold. |
| Retention pruning | Seed snapshots older than 30 days and run `npm run test --workspace @metaverse-systems/llm-tutor-backend`. | Integration test prunes old files and records warnings. |

## Remote LLM Opt-In

1. Open Diagnostics → “LLM Connectivity”.
2. Toggle the remote provider switch; review the consent dialog summarizing endpoints and data usage.
3. Confirm to persist the choice (stored locally; no remote calls happen until opt-in succeeds).
4. Revoke access by toggling off; the event is logged as a `ProcessHealthEvent` and exported snapshots capture the history.

## Data Locations

- **Snapshots** – `app.getPath("userData")/diagnostics/*.jsonl`
- **Retention Logs** – JSONL records appended alongside snapshots with `type: "retention-warning"` events.
- **Exports** – User-selected directory determined via Electron’s save dialog.
- **Preferences (pending electron-store)** – Temporary in-memory cache seeded from the backend; persistent storage arrives with electron-store adoption.

## Troubleshooting

- Run backend diagnostics suite: `npm run test --workspace @metaverse-systems/llm-tutor-backend -- diagnostics`
- Rebuild desktop bundle: `npm run build --workspace @metaverse-systems/llm-tutor-desktop`
- Clear local diagnostics: delete the diagnostics directory and trigger a manual refresh.
- Collect logs for support: export snapshots, capture the latest validation summary (e.g., `docs/reports/diagnostics/2025-10-07-validation.md`), and attach to the support ticket.

## Validation Checklist

- [ ] Backend contract tests pass (`apps/backend/tests/contract`)
- [ ] Integration retention test passes (`apps/backend/tests/integration`)
- [ ] Renderer hook unit tests pass (`apps/frontend/tests/unit`)
- [ ] Accessibility regression passes (`apps/frontend/tests/accessibility`)
- [ ] Electron export smoke passes (`tests/e2e/diagnostics`)
- [ ] Reports archived under `docs/reports/diagnostics/`
