# Quickstart – Persistent Diagnostics Preference Vault

## Goal
Verify that accessibility and remote-provider preferences persist across app restarts, remain offline, and gracefully recover when the vault is unavailable.

## Prerequisites
- Dependencies installed: `npm install`
- Local Playwright browsers installed: `npx playwright install chromium`
- No standalone backend watcher running (Electron dev harness will launch its own instance)

## Steps

1. **Launch the development stack**
   - Run `npm run dev --workspace @metaverse-systems/llm-tutor-desktop`.
   - Ensure the console reports that the backend process is owned by Electron (no `EADDRINUSE`).

2. **Enable accessibility preferences**
   - Open Diagnostics → Accessibility controls.
   - Toggle high contrast and reduced motion on.
   - Confirm the renderer immediately updates styles and motion.

3. **Verify persistence after restart**
   - Quit the desktop app via the system menu.
   - Relaunch using the same dev command.
   - Confirm high contrast and reduced motion are automatically active before interacting with the UI.

4. **Confirm remote provider opt-out**
   - Visit Diagnostics → “LLM Connectivity”.
   - Ensure remote providers remain disabled with consent copy visible.
   - Attempt to enable, review the consent dialog, and cancel to keep opt-out in place.

5. **Simulate storage failure**
   - Temporarily revoke write access to the diagnostics user data directory or set `DIAGNOSTICS_FAKE_STORAGE_FAILURE=1` (to be added in implementation) before toggling preferences.
   - Change a toggle and observe the warning banner explaining that settings are session-only.
   - Inspect the exported diagnostics snapshot and confirm a `StorageHealthAlert` entry exists.

6. **Check consent audit trail**
   - Opt in to remote providers, accept the consent dialog, then opt out again.
   - Export diagnostics logs and verify the most recent consent events reflect the timeline with notice versions.

7. **Restore storage availability**
   - Re-enable directory write access or clear the failure flag.
   - Toggle a preference to ensure the warning clears and the vault saves successfully.

## Validation Signals
- Vitest contract test `apps/backend/tests/contract/diagnostics-preferences.contract.test.ts` fails until backend endpoints implement schemas.
- Playwright scenario `apps/frontend/tests/accessibility/diagnostics-persistence.spec.ts` (to be added) passes once restart/persistence works.
- Diagnostics export includes `preferences` block with latest toggles, consent summary, and storage health status.
