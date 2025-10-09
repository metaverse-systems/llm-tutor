# Tasks: Electron Diagnostics Export Automation

**Input**: Design documents from `/specs/003-003-electron-diagnostics/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Phase 3.1: Setup & Research Consolidation
- [x] T001 Confirm research decisions documented in `research.md` covering remote-debugging ports, snapshot polling, export directory policy, and accessibility verification scope. *(No dependencies)*
- [x] T002 Update project agent context via `.specify/scripts/bash/update-agent-context.sh copilot` with new automation concepts referenced in `plan.md`. *(Depends on T001)*
- [x] T003 Scaffold placeholder docs: create `research.md`, `data-model.md`, `quickstart.md`, and `contracts/` directory if missing. *(Depends on T001)*

## Phase 3.2: Tests First (TDD)
- [x] T004 [P] Draft failing Playwright scenario updates in `tests/e2e/diagnostics/export.spec.ts` to assert dynamic port allocation, snapshot readiness messaging, and export log capture. *(Depends on T003)*
- [x] T005 [P] Add failing Playwright accessibility assertions (keyboard navigation, high-contrast, reduced-motion) to diagnostics export flow, referencing new data attributes. *(Depends on T003)*
- [x] T006 [P] Create failing Vitest unit tests (or equivalent) for the Electron launcher utility in `tests/e2e/tools/electron-launcher.cjs` to validate port handling and error reporting. *(Depends on T003)*
- [x] T007 [P] Add failing tests for new automation scripts in `apps/desktop/scripts/` (e.g., verifying CLI entry points respect environment variables and offline constraints). *(Depends on T003)*
- [x] T008 Produce failing documentation validation placeholder (e.g., lint or markdown check) ensuring docs mention CI command path; can be simple TODO comment flagged in `docs/testing-log.md`. *(Depends on T003)*

## Phase 3.3: Core Implementation
- [x] T009 [P] Enhance `tests/e2e/tools/electron-launcher.cjs` to guarantee Electron receives an available remote-debugging port across platforms; include logging hooks for export verification. *(Depends on T004, T006)*
- [x] T010 [P] Update Playwright export test harness to wait for snapshot readiness with resilient polling/backoff, surface timeout diagnostics, and respect offline environment variables. *(Depends on T004)*
- [x] T011 [P] Integrate new launcher into workspace scripts (`package.json` commands, helper scripts) ensuring CI and local runs share the same entry point. *(Depends on T009)*
- [x] T012 [P] Implement export verification logging utility per `data-model.md`, capturing outcome, timestamps, accessibility state, and storage alerts. *(Depends on T004, T006)*
- [x] T013 [P] Wire log utility into Playwright scenario so each run records summary for diagnostics transparency. *(Depends on T010, T012)*
- [x] T014 Harden save-dialog handling in export test (mock directory selection, permission errors) with user-facing messaging assertions. *(Depends on T004, T010)*
- [x] T015 Ensure accessibility toggles persist through automation by syncing renderer state checks with backend snapshot updates. *(Depends on T005, T010)*
- [x] T016 Update any supporting TypeScript modules (backend/desktop/frontend) required for new log fields or automation hooks, keeping offline guarantees intact. *(Depends on T012, T013, T015)*

## Phase 3.4: Integration & Polish
- [x] T017 [P] Run Playwright suite locally (Linux via xvfb if needed) to confirm new automation passes; capture logs for validation report. *(Depends on T009-T016)*
- [x] T018 [P] Execute Vitest suites across workspaces to ensure launcher/util changes compile and tests pass. *(Depends on T009, T012, T016)*
- [x] T019 [P] Update `docs/diagnostics.md` with new automation workflow, including port resolution explanation, export log locations, and troubleshooting guidance. *(Depends on T010-T016)*
- [x] T020 [P] Refresh `docs/testing-log.md` with latest regression results and note the resolved remote-debugging issue. *(Depends on T017, T018, T019)*
- [x] T021 [P] Add entry to `docs/reports/diagnostics/` summarizing validation sweep for the new automation (date-stamped markdown). *(Depends on T017, T018)*
- [x] T022 Update `specs/003-003-electron-diagnostics/quickstart.md` to describe the CI-aligned command sequence and accessibility verification steps. *(Depends on T010-T016)*
- [x] T023 Ensure `research.md` and `data-model.md` are finalized with decisions and schemas, cross-linking to implementation artifacts. *(Depends on T012, T016)*
- [x] T024 Verify `.specify/templates` references unaffected; document any template adjustments needed for future automation features (optional). *(Depends on T019-T023)*

## Phase 3.5: Validation & Handoff
- [ ] T025 Run full workspace test matrix (`npm run test --workspaces`, Playwright, accessibility suites) and archive outputs in repo under `docs/reports/` as specified. *(Depends on T017-T024)*
- [ ] T026 Conduct accessibility smoke (keyboard-only walkthrough, high-contrast, reduced-motion) manually or via script to confirm learner-first guarantees remain. *(Depends on T015, T017)*
- [ ] T027 Prepare change summary for release notes or future spec updates, referencing automation improvements and logs produced. *(Depends on T019-T026)*

## Dependencies
- T002 → T008 (context updated before doc placeholders flagged)
- T004 → T009, T010, T014
- T005 → T015
- T006 → T009, T012
- T007 → T011
- T010 → T013, T014, T015, T017
- T012 → T013, T016, T023
- T017/T018 → T020, T021, T025
- T019 → T020, T024
- T022 → T025
- T025 → T027
