# Release Notes – Electron Diagnostics Automation

_Date:_ 2025-10-09

## Highlights

- Ensured the workspace `test:e2e` command launches the Electron diagnostics export Playwright suite with TypeScript support and stable matcher wiring.
- Added deterministic `test:e2e` responders for desktop and shared workspaces so monorepo scripts no longer fail on missing commands.
- Patched Playwright teardown by starting and stopping the renderer preview per scenario, eliminating lingering handles that previously tripped worker timeouts.
- Documented the validation sweep and accessibility outcomes across `docs/reports/diagnostics/` and `docs/testing-log.md`.

## Test Matrix

| Command | Notes |
| --- | --- |
| `npm run test --workspaces` | 31 Vitest cases (backend, desktop, frontend, shared) | 
| `npm run test:e2e --workspaces` | Chromium diagnostics export happy-path + failure-path under xvfb |
| `npm run test:a11y --workspaces` | Six accessibility and persistence checks across the landing view |

## Artifacts

- Playwright HTML reports available under `docs/reports/playwright/`.
- Diagnostics export JSONL logs stored beside generated snapshots (`${app.getPath("userData")}/diagnostics/exports`).
- Validation summary captured in `docs/reports/diagnostics/2025-10-09-validation.md`.

## Next Steps

- Monitor the desktop dev harness for duplicate backend boot warnings.
- Continue rolling the expect-reset shim into CI once mature.
