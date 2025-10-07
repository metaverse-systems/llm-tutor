# Quickstart – Foundational Workspace & Diagnostics Scaffold

## Goal
Validate that the desktop build boots offline, displays diagnostics data, surfaces accessibility controls, and enforces the 30-day/500 MB logging policy.

## Prerequisites
- Node.js 20+
- `npm install` executed at repo root
- Local llama.cpp endpoint optional (diagnostics should still report `unreachable` when absent)

## Steps
1. **Build shared packages**
   - Run `npm run build --workspaces`.
   - Confirm `packages/shared/dist/index.js` exists.
2. **Start backend in watch mode**
   - From repo root run `npm run dev --workspace @metaverse-systems/llm-tutor-backend`.
   - Expect console output `LLM Tutor backend starting...` and the diagnostics log directory created under `~/.../AppData/LLM Tutor/diagnostics` (exact path per OS).
3. **Launch frontend dev server**
   - In a new terminal run `npm run dev --workspace @metaverse-systems/llm-tutor-frontend`.
   - Ensure Vite reports the dev URL (typically `http://localhost:5173`).
4. **Run the desktop shell**
   - From repo root execute `npm run dev --workspace @metaverse-systems/llm-tutor-desktop`.
   - Electron window should open automatically.
5. **Open Diagnostics view**
   - Use keyboard (`Tab` → `Enter`) to activate the Diagnostics button.
   - Verify the view displays backend status, renderer URL, log directory, LLM status, and last updated timestamp.
6. **Toggle accessibility controls**
   - Use keyboard navigation to toggle high contrast and reduced motion.
   - Confirm the UI updates immediately and the next diagnostics snapshot reflects the chosen settings.
7. **Simulate backend failure**
   - Stop the backend terminal (Ctrl+C). Observe the Electron app showing a human-readable warning and logging the `ProcessHealthEvent` locally.
8. **Generate export**
   - In the Diagnostics modal click “Export snapshot” and save to a temporary location.
   - Verify the exported JSON matches the latest snapshot.
9. **Check retention enforcement**
   - Populate sample snapshots (fast path: call the diagnostics refresh action >30 times and inject an artificially large file) then rerun the app.
   - Confirm warnings appear when disk usage >500 MB and that snapshots older than 30 days are pruned when the rotation job runs.

## Expected Outcome
- Desktop shell operates entirely offline.
- Diagnostics summary reflects real-time backend and LLM statuses.
- Accessibility toggles persist across restarts.
- Warnings fire when retention thresholds are breached.
- No remote network calls occur unless the user later opts into a remote provider (outside this feature).
