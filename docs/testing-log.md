# Diagnostics Quickstart Execution Log

_Date:_ 2025-10-10  
_Operator:_ Automation via GitHub Copilot agent

## Unified theme enforcement sweep

### Step 0 – Profile vault persistence validation

```bash
npm run --workspace @metaverse-systems/llm-tutor-shared build
npm run --workspace @metaverse-systems/llm-tutor-backend build
npm run --workspace @metaverse-systems/llm-tutor-backend test:unit
```

Outcome: ✅ Shared workspace emits fresh declaration maps, backend TypeScript build succeeds under bundler resolution, and the ProfileVault + Encryption unit suites (18 specs) pass against the new electron-store-backed persistence layer.

### Step 1 – Consolidated lint + theme orchestration

```bash
npm run lint
```

Outcome: ✅ The enhanced lint script ran workspace ESLint checks, formatter audit (`--check` mode), regenerated token assets, rebuilt Tailwind layers for every workspace, executed the shared Vitest theme suites, and finished with the frontend and desktop high-contrast Playwright specs. CI now relies on this single entry point for theme validation.

### Step 2 – Desktop high-contrast smoke (focused rerun)

```bash
npx playwright test apps/desktop/tests/main/high-contrast.theme.spec.ts
```

Outcome: ✅ The diagnostics window launched with `ThemeHarness`, reported `data-theme="contrast"`, and passed axe checks. Preference seeds are logged when `LLM_TUTOR_DIAGNOSTICS_LOG=1`.

### Step 3 – Frontend accessibility sweep (focused rerun)

```bash
npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend -- --grep "Unified theme high contrast accessibility"
```

Outcome: ✅ High-contrast toggle exercised `useThemeMode`, and axe returned zero violations. Generated report archived under `docs/reports/playwright/`.

---

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

Outcome: ✅ Playwright now delegates to the Electron launcher, which guarantees a concrete remote-debugging port. Optional `DEBUG_ELECTRON_LAUNCH=1` and `LLM_TUTOR_DIAGNOSTICS_LOG=1` flags print the resolved port and export summary to stderr. The automation deposits a JSONL export log beside the snapshot (default `${app.getPath("userData")}/diagnostics/exports`).

## Additional Validation

- Vitest across all workspaces: ✅
- Shared schema tests: ✅
- Backend integration retention: ✅
- Renderer hook unit coverage: ✅
- Desktop preload IPC coverage: ✅

## CI Troubleshooting – Lint, Tokens, and Tailwind

CI now delegates to the root `npm run lint`, which chains ESLint, formatter checks, token
generation, Tailwind builds, Vitest theme suites, and the frontend/desktop high-contrast
Playwright specs. Use the following steps when a pipeline fails:

### Consolidated lint entry point (`npm run lint`)

1. Reproduce locally to surface the first failing stage:

	```bash
	npm run lint
	```

2. Inspect the output headers (each step prints `→ Step Name`). Address the first failure
	before rerunning; later steps are skipped automatically.
3. For Playwright failures, rerun the targeted spec (see Steps 2–3 in the latest sweep
	log above) after ensuring token assets are fresh (`npm run build:tokens`).

### Formatter check (`npm run format:css -- --check`)

1. Reproduce locally from the repo root:

	```bash
	npm run format:css -- --check
	```

2. If the command reports changed files, apply the fixes automatically:

	```bash
	npm run format:css
	```

3. Re-run the check to confirm it passes. When targeting a single workspace, append
	`--workspace <package>`.
4. Commit the formatted files. Generated `.tailwind` artifacts remain ignored, so only source
	files should change.

### Tailwind build (`npm run tailwind:build`)

1. Run the build locally with verbose logging:

	```bash
	npm run tailwind:build -- --ci
	```

2. Inspect stderr for missing config errors. Ensure each workspace has its Tailwind entry
	file (e.g., `src/styles/tailwind.css`) and that new components import Tailwind layers.
3. If the failure stems from PostCSS plugins, reinstall dependencies via `npm install` and
	retry.
4. For workspace-specific issues, invoke `npm run tailwind:build --workspace <package>` to
	isolate the failing bundle.
5. Once fixed, regenerate theme assets (`npm run build:tokens`) and any documentation that
	references the build output (e.g., Playwright reports) before re-running CI.

## Follow-ups

1. ~~Resolve Playwright/Electron compatibility so the export smoke test can run without manual intervention.~~ Addressed 2025-10-09 via launcher port negotiation and documentation updates.
2. Eliminate double backend boot in the desktop dev harness (consider gating the backend watcher when Electron spawns its managed instance).

### Fixture Retention Decision (2025-10-09)

- The misformatted CSS/SCSS fixtures introduced for formatter tests (`apps/frontend/tests/unit/__fixtures__/formatter/frontier.css` and
	`frontier.scss`) remain in place. They provide regression coverage for `apps/frontend/tests/unit/formatter.spec.ts`, which exercises the
	shared formatter scripts. Future cleanup should only occur if an alternative fixture strategy replaces these tests.

Reference: automation workflow, port handling, and export log guidance now captured in `docs/diagnostics.md`.

---

# Persistence Vault Regression Sweep

_Date:_ 2025-10-08  
_Operator:_ Automation via GitHub Copilot agent

## Step 1 – Vitest across all workspaces

```bash
npm run test --workspaces
```

Outcome: ✅ Backend, desktop, frontend, and shared Vitest suites all passed (31 tests total). Contract and integration coverage confirm the new preference endpoints.

## Step 2 – Rebuild frontend bundle for preview server

```bash
npm run build --workspace @metaverse-systems/llm-tutor-frontend
```

Outcome: ✅ Vite emitted a fresh production bundle so the preview server reflects the storage-alert markup change needed by Playwright.

## Step 3 – Accessibility + persistence regression

```bash
cd apps/frontend
npx playwright test tests/accessibility/diagnostics.spec.ts tests/accessibility/diagnostics-persistence.spec.ts
```

Outcome: ✅ All six scenarios (three accessibility, three persistence) passed after refining the storage-failure locators. Latest HTML report stored under `docs/reports/playwright/`.

## Step 4 – Desktop harness smoke

```bash
timeout 15 npm run dev --workspace @metaverse-systems/llm-tutor-desktop
```

Outcome: ⚠️ Lock-guard confirmed—only the managed backend instance booted—but Electron exited with `ERR_MODULE_NOT_FOUND` while resolving `packages/shared/dist/diagnostics/preference-record`. Although `dist/diagnostics/preference-record.js` exists, Node’s ESM resolver rejects the extension-less import emitted by TypeScript. Requires follow-up before the harness can complete unattended.

## Additional notes

- Rebuilt shared diagnostics package via `npx tsc -p packages/shared/tsconfig.build.json` prior to the smoke test to refresh emitted artifacts.
- Playwright persistence failure simulation now renders both toast and panel alerts; debug traces attached in the Playwright HTML report.
- Update 2025-10-08: Follow-up #1 below resolved by adding explicit `.js` extensions to shared diagnostics module imports.
- Update 2025-10-08: Follow-up #2 below resolved by adding workspace-level `test:a11y` placeholder scripts and pointing the frontend command at `playwright.config.ts`.

## Follow-ups

1. ~~Adjust shared package emit (or Electron bundler config) so runtime imports include `.js` extensions, unblocking the desktop smoke harness.~~ Resolved 2025-10-08 by adding explicit `.js` extensions to shared diagnostics modules.
2. ~~Restore workspace-level `test:a11y` script or update the root helper to skip packages without that command.~~ Resolved 2025-10-08 by adding placeholder scripts and aligning the frontend Playwright command.

Reference: CI-aligned diagnostics export flow documented in `docs/diagnostics.md` (Automation Workflow section).

---

# Automation Validation Sweep

_Date:_ 2025-10-09  
_Operator:_ Automation via GitHub Copilot agent

## Step 1 – Workspace Playwright diagnostics export

```bash
npm run test:e2e --workspaces
```

Outcome: ✅ Two Chromium scenarios pass in 15 s. Launcher emits `[diagnostics-export] remote-debugging-port` telemetry and both export success/failure flows attach their JSONL logs under `docs/reports/playwright/`.

## Step 2 – Vitest across all workspaces

```bash
npm run test --workspaces
```

Outcome: ✅ 31 tests passing (backend, desktop, frontend, shared). Desktop preload suite confirms expectations for empty payload objects.

## Step 3 – Accessibility smoke

```bash
npm run test:a11y --workspaces
```

Outcome: ✅ Six accessibility scenarios cover keyboard navigation, high contrast, reduced motion, remote provider consent, persistence, and storage fallback messaging. Reports stored in `docs/reports/playwright/`.

## Step 4 – Log verification

Reviewed the generated export log: contains `status: "success"`, matched snapshot path, and `accessibilityState` reflecting toggles enforced during automation (`highContrast: true`, `reduceMotion: true`, `remoteProviders: true`, `keyboardNavigationVerified: true`).

## Artifacts

- Playwright HTML report and stderr capture archived in `docs/reports/playwright/`.
- Export JSONL log preserved alongside snapshots for reference.

## Follow-ups

1. Publish a diagnostics validation report for 2025-10-09 under `docs/reports/diagnostics/` (tracked by T021).
2. Re-run the desktop dev harness smoke once backend auto-start coordination is addressed (pending earlier follow-up).
