# Release Notes – Unified Visual Theme Rollout

_Date:_ 2025-10-10

## Highlights

- Published the shared theme token catalogue and generator, producing `theme.tokens.json` and `theme.css` for all workspaces via `npm run build:tokens`.
- Upgraded `npm run lint` to orchestrate linting, formatter checks, token builds, Tailwind compilation, Vitest theme suites, and both Playwright high-contrast scenarios (frontend + desktop).
- Shipped the `ThemeModeProvider` across web and desktop surfaces, ensuring `data-theme="contrast"` / reduced-motion attributes stay in sync with the diagnostics preference vault.
- Refreshed contributor docs (`docs/frontend-quickstart.md`, `docs/diagnostics.md`, `docs/testing-log.md`) with the new workflow, validation checklists, and troubleshooting guidance.

## Test Matrix

| Command | Notes |
| --- | --- |
| `npm run lint` | Runs ESLint, formatter check, token build, Tailwind builds, shared Vitest theme suite, frontend + desktop high-contrast Playwright specs |
| `npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend -- --grep "Unified theme high contrast accessibility"` | Frontend accessibility coverage for theme toggles and axe validation |
| `npx playwright test apps/desktop/tests/main/high-contrast.theme.spec.ts` | Electron diagnostics high-contrast harness seeded by `ThemeHarness` |

## Artifacts

- Generated theme assets live under `packages/shared/dist/` (`theme.css`, `theme.tokens.json`) and are consumed automatically by Tailwind + Electron.
- Playwright HTML reports for the high-contrast scenarios stored in `docs/reports/playwright/`.
- Updated operational guidance documented in `docs/frontend-quickstart.md`, `docs/diagnostics.md`, and `docs/testing-log.md`.

## Next Steps

- Monitor lint runtime; consider caching Tailwind output if CI duration regresses.
- Expand release documentation to cover upcoming diagnostics validation report (T021).
