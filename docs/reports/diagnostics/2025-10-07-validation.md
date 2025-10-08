# Diagnostics Validation – 2025-10-07

| Check | Command | Result | Notes |
| --- | --- | --- | --- |
| Workspace builds | `npm run build --workspaces` | ✅ | All packages compiled; desktop bundler output verified. |
| Backend unit + integration | `npm run test --workspace @metaverse-systems/llm-tutor-backend` | ✅ | Contract and retention suites green. |
| Renderer unit hooks | `npm run test --workspace @metaverse-systems/llm-tutor-frontend` | ✅ | New `useDiagnostics` unit tests exercised bridge behaviour. |
| Desktop preload unit | `npm run test --workspace @metaverse-systems/llm-tutor-desktop` | ✅ | IPC bridge coverage passes. |
| Shared schema unit | `npm run test --workspace @metaverse-systems/llm-tutor-shared` | ✅ | Schema expectations unchanged. |
| Accessibility regression | `npx playwright test tests/accessibility/diagnostics.spec.ts --config apps/frontend/playwright.config.ts` | ✅ | Preview server launched via Playwright `webServer`; artefacts in `docs/reports/playwright`. |
| Electron export smoke | `NODE_OPTIONS=--import=tsx xvfb-run -a npx playwright test tests/e2e/diagnostics/export.spec.ts` | ✅ | Custom launcher (`tests/e2e/tools/electron-launcher.cjs`) remaps `--remote-debugging-port=0`, allowing the Playwright Electron harness to complete the JSONL export workflow. |

## Attachments

- Playwright HTML report: `docs/reports/playwright/index.html`
- Vitest console output snippets recorded in `docs/testing-log.md`
- Electron harness output captured in `docs/testing-log.md`
