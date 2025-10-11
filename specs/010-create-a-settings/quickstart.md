# Quickstart – Settings Page Accessible from Global Header

## Prerequisites
- Node.js 20 and npm installed.
- Workspace dependencies installed (`npm install` from repo root).
- Access to both Electron and web development tooling (`npm run dev --workspace @metaverse-systems/llm-tutor-desktop` and `npm run dev --workspace @metaverse-systems/llm-tutor-frontend`).

## Verification Steps
1. **Start web dev server**
   - Run `npm run dev --workspace @metaverse-systems/llm-tutor-frontend`.
   - Open the app in the browser.
2. **Open Settings via keyboard**
   - Focus the global header using `Tab` until the gear icon is highlighted.
   - Press `Enter` to navigate to `/settings`.
   - Confirm focus lands on the Settings `<h1>` heading and a "Return to previous view" skip link is visible.
3. **Validate Settings sections**
   - Verify the General section shows theme selection and telemetry toggle copy explaining the opt-out default.
   - Confirm the LLM Profiles section renders the existing management panel.
   - Confirm Diagnostics section displays export action and retention information links.
4. **Check telemetry default**
   - Ensure the telemetry toggle is Off by default and explanatory text references local-only data handling.
5. **Run accessibility scan**
   - Execute the Playwright + axe scenario to confirm heading hierarchy, aria labels, and focusable elements pass WCAG checks.
6. **Electron parity**
   - Launch the Electron app dev mode (`npm run dev --workspace @metaverse-systems/llm-tutor-desktop`).
   - Repeat steps 2–5 within the desktop shell.

## Expected Results
- Gear icon is reachable via keyboard and mouse, and visually indicates active state on `/settings`.
- Focus management behaves identically in web and Electron contexts.
- Telemetry remains disabled until the learner toggles it on; enabling records consent timestamp.
- Diagnostics links trigger existing export dialogs or documentation without errors.
- Playwright + axe checks pass after implementation.
