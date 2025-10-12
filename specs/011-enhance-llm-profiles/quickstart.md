# Quickstart: Verifying LLM Profile Test Transcript

## Prerequisites
- Existing LLM profile with valid provider credentials (local or remote)
- Desktop app running in development mode (`npm run dev --workspace @metaverse-systems/llm-tutor-desktop`)
- Backend and renderer dev servers started via workspace scripts

## Steps
1. Open the Settings → LLM Profiles page in the renderer.
2. Select a profile and enter a sample prompt (≤500 characters) in the Test connection field.
3. Click **Test connection**.
4. Verify the transcript panel expands beneath the profile row:
   - Focus shifts to the panel header.
   - Screen reader announces "Test transcript available" via aria-live.
   - The panel lists up to three exchanges beginning with the most recent.
5. Confirm metadata chips show latency, status (success/error), and truncation indicator when applicable.
6. Trigger two additional tests (modify prompt slightly) and ensure only the three latest exchanges remain.
7. Collapse and reopen the panel; transcript content persists.
8. Close the settings view or switch to another profile; verify the transcript clears when you return.
9. Induce an error (e.g., disconnect provider) and rerun the test:
   - Transcript content hides.
   - Error code and remediation text display inline.
   - aria-live announces failure guidance.
10. Export diagnostics (`docs/diagnostics.md` procedure) and confirm breadcrumb historyDepth reflects 1–3 without containing full prompts.

## Expected Outcomes
- Transcript is viewable, keyboard accessible, and limited to the most recent three exchanges.
- Error states hide stale transcript content and present remediation guidance.
- Diagnostics logs redact prompt/response text while preserving latency and correlation IDs.
