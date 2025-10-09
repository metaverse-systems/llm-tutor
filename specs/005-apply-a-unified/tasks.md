# Tasks: Unified Visual Theme Rollout

**Input**: Design documents from `/specs/005-apply-a-unified/`
**Prerequisites**: `plan.md` (required), `research.md`, `data-model.md`

## Execution Flow (main)
```
1. Load plan.md for tech stack, workspace structure, and constitutional gates
2. Load design assets:
   → research.md for baseline audit, risks, QA strategy
   → data-model.md for token schema, hook contract, validation rules
   → quickstart.md for contributor workflow, testing checklist
3. Generate tasks grouped by phase:
   → Setup: build scripts, tooling pipelines
   → Tests: contract/unit/e2e specs (fail first)
   → Core: tokens, generators, hooks, UI migrations
   → Integration: CI wiring, platform alignment
   → Polish: docs, release notes
4. Apply rules:
   → Tests precede implementation (TDD)
   → Independent files marked [P] for parallel execution
   → Shared files updated sequentially (no [P])
5. Number tasks sequentially (T001, T002, ...)
6. Define dependencies and parallel execution guidance
7. Return SUCCESS with ready-to-run task list
```

## Phase 3.1: Setup
- [x] T001 Configure `packages/shared/tsconfig.build.json` to emit theme assets into `dist/` with declaration maps for downstream consumption. *(Build config now fixes root/out directories, enables declaration maps, and adds incremental metadata so downstream consumers resolve compiled theme assets from `dist/`.)*
- [x] T002 Update `scripts/tailwind-build.cjs` to bundle `packages/shared/dist/theme.css` before invoking frontend and desktop Tailwind builds. *(Orchestrator runs the shared workspace build and an optional `build:tokens` step ahead of Tailwind builds, ensuring theme CSS is generated prior to frontend/desktop compilation.)*

## Phase 3.2: Tests First (TDD)
**CRITICAL: These specs must be written and observed failing before any implementation in Phase 3.3.**
- [x] T003 Create contract test `packages/shared/tests/unit/theme.tokens.contract.test.ts` asserting every semantic token includes a high-contrast variant and matches the Zod schema. *(New Vitest contract suite imports the forthcoming token schema; current run fails because `src/styles/tokens` is not implemented yet.)*
- [x] T004 [P] Add snapshot test `packages/shared/tests/unit/theme.css.spec.ts` verifying generated CSS variables for standard vs. `data-theme="contrast"` states. *(Snapshot harness targets the planned generator output; Vitest currently errors because `generateThemeAssets` is missing.)*
- [x] T005 [P] Author Playwright accessibility test `apps/frontend/tests/accessibility/high-contrast.theme.spec.ts` to toggle the web UI into high-contrast mode and pass axe checks. *(Playwright run now errors on missing `@axe-core/playwright` and the body lacks `data-theme="contrast"`, keeping the test red.)*
- [x] T006 [P] Author Playwright/Electron test `apps/desktop/tests/main/high-contrast.theme.spec.ts` ensuring the diagnostics window loads theme assets, syncs preferences, and passes axe. *(Desktop spec imports a temporary harness that throws until theme assets and axe integration exist, leaving the suite failing as expected.)*

## Phase 3.3: Core Implementation (run after Phase 3.2 tests are red)
- [ ] T007 Implement token catalogue & Zod schema per `data-model.md` in `packages/shared/src/styles/tokens.ts`, covering standard and high-contrast values plus metadata.
- [ ] T008 Build theme asset generator `packages/shared/src/styles/generateThemeAssets.ts` and update `packages/shared/src/index.ts` to expose JSON export helpers.
- [ ] T009 Wire `build:tokens` CLI workflow by updating root `package.json` and `packages/shared/package.json` to invoke the generator and emit `dist/theme.tokens.json` + `theme.css`.
- [ ] T010 Extend `tailwind.config.ts` to import generated tokens, register semantic color/spacing/typography scales, and safelist `data-theme="contrast"` selectors.
- [ ] T011 Update `packages/shared/src/styles/tailwind.css` with `@layer base` / `@layer components` definitions that map utilities to CSS variables and reduced-motion overrides.
- [ ] T012 Implement shared mode management hook in `packages/shared/src/hooks/useThemeMode.ts` and export it through `packages/shared/src/index.ts`.
- [ ] T013 Integrate theme provider bootstrap in `apps/frontend/src/index.tsx`, initializing appearance/motion state and wiring persistence per quickstart guidance.
- [ ] T014 Refactor `apps/frontend/src/pages/landing/index.tsx` to consume semantic Tailwind classes and `useThemeMode` toggles.
- [ ] T015 Update `apps/frontend/src/styles/tailwind.css` to include reusable component compositions (cards, buttons, focus rings) backed by the new tokens.
- [ ] T016 [P] Migrate `apps/frontend/src/components/DiagnosticsPanel/DiagnosticsPanel.tsx` from legacy class names to unified Tailwind utilities and semantic tokens.
- [ ] T017 [P] Migrate `apps/frontend/src/components/AccessibilityToggles/AccessibilityToggles.tsx` to rely on `useThemeMode` and semantic utility stacks.
- [ ] T018 Align Electron diagnostics window by updating `apps/desktop/src/main/diagnostics/index.ts` to preload theme assets, sync appearance/motion preferences, and inject CSS variables into the BrowserWindow.

## Phase 3.4: Integration
- [ ] T019 Enhance `scripts/lint-all.cjs` (and any referenced CI entrypoints) to run `pnpm build:tokens`, Vitest theme suites, and new Playwright specs.

## Phase 3.5: Polish
- [ ] T020 Refresh contributor docs with new workflows (`docs/frontend-quickstart.md`, `docs/diagnostics.md`, `docs/testing-log.md`, and `docs/release-notes/005-apply-a-unified.md`) detailing tokens, scripts, and validation steps.

## Dependencies
- T001 → T002 (dist output required before bundling) → T003+
- T003 must complete before T007 (schema implementation)
- T004, T005, T006 can run in parallel after T003 but must finish before T007–T018
- T007 → T008 → T009 (shared exports & CLI build chain)
- T009 → T010 (Tailwind needs generated tokens)
- T010 → T011 → T013–T017 (frontend depends on theme layers)
- T013 → T014 → T015 (landing + styles rely on provider)
- T015 enables T016 & T017 to proceed in parallel
- T012 must precede T014, T016, T017 (shared hook consumption)
- T018 depends on T009 (build artifacts) and T012 (mode syncing)
- T019 waits for all implementation tasks (T007–T018) to ensure CI covers new commands
- T020 is final polish after integration completes

## Parallel Execution Example
```
# Run accessibility-focused specs together once T003 is done:
/task run T004
/task run T005
/task run T006

# Later, migrate frontend components in parallel:
/task run T016
/task run T017
```

## Notes
- `[P]` tasks target independent files and can be executed concurrently when prerequisites are satisfied.
- Verify new tests fail before implementing corresponding functionality to honor TDD.
- Commit after each task to preserve atomic history and simplify code review.
