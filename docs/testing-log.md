# Diagnostics Quickstart Execution Log

_Date:_ 2025-10-07  
_Operator:_ Automation via GitHub Copilot agent

## Step 1 – Build shared packages

```bash
npm run build --workspaces
```

Outcome: ✅ All workspaces compiled. Desktop bundler emitted `dist/main.js` and `dist/preload.js` artefacts; frontend build completed in 635 ms.

## Step 2 – Start backend in watch mode

```bash
timeout 5 npm run dev --workspace @metaverse-systems/llm-tutor-backend
```

Outcome: ✅ Backend announced `Diagnostics API listening at http://127.0.0.1:4319` before the timeout reclaimed the process (exit code 124 expected from `timeout`).

## Step 3 – Launch frontend dev server

```bash
timeout 5 npm run dev --workspace @metaverse-systems/llm-tutor-frontend
```

Outcome: ✅ Vite reported `Local: http://localhost:5173/`; the command exited after the timeout window.

## Step 4 – Run desktop shell harness

```bash
timeout 15 npm run dev --workspace @metaverse-systems/llm-tutor-desktop
```

Outcome: ⚠️ Electron, backend, bundler, and Vite all spin up. The Electron-managed backend immediately restarted and exited with `EADDRINUSE` because the separate backend watcher (Step 2) still owned port 4319. Manual `npx electron apps/desktop/dist/main.js` succeeds after terminating the duplicate watcher.

## Step 5 – Diagnostics view & accessibility toggles

UI exercised through automated Playwright accessibility suite (see Step 8). Manual keyboard walkthrough not recorded due to headless environment.

## Step 6 – Accessibility controls persistence

Covered by Playwright regression (Step 8). Verified persistence through DOM snapshots—body attributes remain after reload.

## Step 7 – Simulate backend failure

Validated by unit/integration tests and by observing electron dev harness logs when backend watcher is terminated (Electron surfaces `Diagnostics summary request failed: DIAGNOSTICS_NOT_FOUND`).

## Step 8 – Accessibility regression

```bash
npx playwright test tests/accessibility/diagnostics.spec.ts --config apps/frontend/playwright.config.ts
```

Outcome: ✅ Playwright auto-started Vite preview and passed all three accessibility checks. HTML report stored under `docs/reports/playwright/`.

## Step 9 – Export workflow

```bash
NODE_OPTIONS=--import=tsx xvfb-run -a npx playwright test tests/e2e/diagnostics/export.spec.ts
```

Outcome: ⚠️ Playwright’s `_electron.launch` failed because Electron 38 rejects the `--remote-debugging-port=0` flag. Manual export flow (launching via `npx electron apps/desktop/dist/main.js`) works, but a wrapper or Playwright upgrade is required for automated coverage.

## Additional Validation

- Vitest across all workspaces: ✅
- Shared schema tests: ✅
- Backend integration retention: ✅
- Renderer hook unit coverage: ✅
- Desktop preload IPC coverage: ✅

## Follow-ups

1. Resolve Playwright/Electron compatibility so the export smoke test can run without manual intervention.
2. Eliminate double backend boot in the desktop dev harness (consider gating the backend watcher when Electron spawns its managed instance).
