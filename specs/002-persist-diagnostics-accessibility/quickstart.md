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
   - Ensure the lock-aware harness reports that the backend process is owned by Electron (no `EADDRINUSE`).

2. **Enable accessibility preferences**
   - Open Diagnostics → Accessibility controls.
   - Toggle high contrast and reduced motion on.
   - Confirm the renderer immediately updates styles and motion.

3. **Verify persistence after restart**
   - Quit the desktop app via the system menu.
   - Relaunch using the same dev command.
   - Confirm high contrast and reduced motion are automatically active before interacting with the UI and the consent summary references the previous choice.

4. **Confirm remote provider opt-out**
   - Visit Diagnostics → “LLM Connectivity”.
   - Ensure remote providers remain disabled with consent copy visible.
   - Attempt to enable, review the consent dialog, and cancel to keep opt-out in place.

5. **Simulate storage failure**
   - Locate `${app.getPath("userData")}/diagnostics-preferences.json` (printed in the desktop console during preference writes).
   - Temporarily revoke write access (Linux/macOS: `chmod u-w diagnostics-preferences.json`; Windows: remove write permission in the file properties) or use a REST client to `PUT /internal/diagnostics/preferences` with `"consentSummary": "Simulate storage failure"`.
   - Change a toggle and observe the warning banner explaining that settings are session-only while `window.llmTutor.diagnostics.getState()` reports a `storageHealth` payload.
   - Restore permissions and toggle again to verify the alert clears automatically.

6. **Check consent audit trail**
   - Opt in to remote providers, accept the consent dialog, then opt out again.
   - Export diagnostics logs and verify the most recent consent events reflect the timeline with notice versions under `preferences.consentEvents`.

7. **Restore storage availability**
   - Re-enable directory write access or clear the failure flag.
   - Toggle a preference to ensure the warning clears and the vault saves successfully.

## Validation Signals
- Vitest contract test `apps/backend/tests/contract/diagnostics-preferences.contract.test.ts` covers GET/PUT and storage-unavailable cases.
- Playwright scenario `apps/frontend/tests/accessibility/diagnostics-persistence.spec.ts` passes once restart/persistence + storage failure messaging work.
- Diagnostics export includes `preferences` block with latest toggles, consent summary, and storage health status.
