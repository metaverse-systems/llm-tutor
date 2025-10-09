# Quickstart: Electron Diagnostics Export Automation

_Last updated: 2025-10-09_

This guide will describe the CI-aligned workflow for running the diagnostics export automation once the implementation tasks land.

## Prerequisites
- Node.js 20 with workspace dependencies installed (`npm install`).
- Playwright browsers installed (`npx playwright install --with-deps`).
- Electron 38 tooling available via the workspace packages.

## Fast Path (To Be Finalized)
1. Ensure the backend and renderer previews are launched using the workspace scripts. <!-- TODO: link exact commands after T011. -->
2. Run the shared automation entry point. <!-- TODO: confirm command after launcher integration (T011). -->
3. Review the resulting logs under `app.getPath("userData")/diagnostics/exports`. <!-- TODO: add explicit path example post-implementation. -->

## Troubleshooting Checklist
- **Remote debugging conflicts**: Verify the launcher allocated a free port; consult the log output for retry details. <!-- TODO: cite log filename after T009. -->
- **Snapshot timeouts**: Ensure polling respects the exponential backoff configuration outlined in `research.md`. <!-- TODO: include environment variables once defined. -->
- **Accessibility verification**: Confirm the test toggles high-contrast and reduced-motion before export (will be automated in T005/T015). <!-- TODO: link to instructions once UI flow is scripted. -->

Update this quickstart during Phase 3 once scripts, tests, and documentation tasks are implemented (T010–T022).
