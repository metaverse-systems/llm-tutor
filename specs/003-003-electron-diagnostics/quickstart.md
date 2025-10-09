# Quickstart: Electron Diagnostics Export Automation

_Last updated: 2025-10-09_

This guide outlines the CI-aligned workflow for running the diagnostics export automation after Phase 3.4.

## Prerequisites
- Node.js 20 with workspace dependencies installed (`npm install`).
- Playwright browsers installed (`npx playwright install --with-deps`).
- Electron 38 tooling available via the workspace packages.

## Fast Path
1. **Prep the workspace**
	```bash
	npm install
	npm run build --workspaces
	npx playwright install --with-deps
	```
	Builds refresh the Electron desktop bundle so Playwright can launch `dist/main.js` during the export scenario.

2. **Run the diagnostics export automation**
	```bash
	NODE_OPTIONS=--import=tsx xvfb-run -a npx playwright test tests/e2e/diagnostics/export.spec.ts
	```
	- Set `LLM_TUTOR_DIAGNOSTICS_LOG=1` to mirror export telemetry (remote debugging port, launcher warnings) to stderr.
	- Optionally add `DEBUG_ELECTRON_LAUNCH=1` when debugging launcher arguments.
	- In CI, prepend `timeout --preserve-status 180s` to guarantee the run exits if the inspector stays open.

3. **Review artifacts**
	- Exported snapshots and JSONL logs land alongside the chosen directory. By default they reside under `${app.getPath("userData")}/diagnostics/exports/diagnostics-snapshot-export-<timestamp>.log.jsonl`.
	- Playwright HTML/trace reports are emitted to `docs/reports/playwright/automation-<timestamp>/` when `PLAYWRIGHT_HTML_REPORT` is configured (see `docs/testing-log.md`).
	- Inspect the JSONL entry to confirm `outcome: "success"`, `snapshotPath`, and `accessibilityState` (toggles forced before export).

## Accessibility Verification
- The Playwright harness enables high contrast and reduced motion via the landing page toggles before capturing the export.
- Double-check the exported JSONL log’s `accessibilityState` values for audits. A missing toggle indicates the renderer failed to sync preferences; rerun after inspecting console output.

## Troubleshooting Checklist
- **Remote debugging conflicts**: Launcher allocates a concrete port and exposes it as `ELECTRON_REMOTE_DEBUGGING_PORT`. Use `LLM_TUTOR_REMOTE_DEBUG_PORT=<port>` for deterministic captures in CI.
- **Snapshot timeouts**: Consult the exported JSONL log failure entry and renderer console. Ensure the backend is reachable and that polling backoff (`ensureSnapshotAvailable`) hasn’t been shortened.
- **Electron shutdown delays**: Wrap the command with `timeout --preserve-status 180s` and verify the `closeElectronApp` helper logs when exiting. Stuck processes typically signal hung preload IPC listeners.

Refer to `docs/diagnostics.md` for the full automation workflow, port negotiation details, and troubleshooting playbook.
