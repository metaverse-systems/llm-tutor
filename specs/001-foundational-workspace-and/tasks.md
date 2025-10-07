# Tasks: Foundational Workspace & Diagnostics Scaffold

**Input**: Design documents from `/specs/001-foundational-workspace-and/`
**Prerequisites**: `plan.md` (required), `research.md`, `data-model.md`, `contracts/`

## Phase 3.1: Setup & Tooling
- [ ] T001 Audit monorepo prerequisites and install dependencies across `package.json` workspaces; record any missing tooling in `docs/architecture.md` dependencies section.
- [ ] T002 Scaffold diagnostics directories (`apps/backend/src/api/diagnostics/`, `apps/backend/src/services/diagnostics/`, `apps/backend/src/infra/{logging,preferences}/`, `apps/frontend/src/pages/landing/`, `apps/frontend/src/components/{DiagnosticsPanel,AccessibilityToggles}/`, `apps/desktop/src/{main,preload,ipc}/diagnostics/`, `packages/shared/src/diagnostics/`, `tests/e2e/diagnostics/`) with placeholder `index.ts` exports.
- [ ] T003 [P] Configure shared Vitest + Playwright test runner settings for diagnostics feature, updating `vitest.config.ts` files and `package.json` scripts where needed.
- [ ] T004 [P] Add project-wide `.env.example` entries for diagnostics storage paths and log retention thresholds; sync defaults in `apps/backend/src/config/`.

## Phase 3.2: Tests First (All must fail initially)
- [ ] T005 Flesh out contract coverage in `apps/backend/tests/contract/diagnostics.contract.test.ts` for `GET /internal/diagnostics/summary` (happy/empty/error cases) and `POST /internal/diagnostics/refresh` (success + offline guard).
- [ ] T006 [P] Author renderer accessibility regression in `apps/frontend/tests/accessibility/diagnostics.spec.ts` validating keyboard order, high-contrast toggle, and reduced-motion preference.
- [ ] T007 [P] Add Electron smoke + export test `tests/e2e/diagnostics/export.spec.ts` ensuring snapshot export dialog appears and JSONL file saves locally.
- [ ] T008 [P] Create backend integration test `apps/backend/tests/integration/diagnostics-retention.test.ts` covering log pruning at 30 days and 500 MB warning emission.
- [ ] T009 [P] Add shared schema unit tests `packages/shared/src/diagnostics/__tests__/snapshots.spec.ts` validating Zod schemas against known payload fixtures.

## Phase 3.3: Core Domain & Services (Implement after tests exist)
- [ ] T010 Implement shared diagnostics domain models & Zod schemas in `packages/shared/src/diagnostics/index.ts`, exporting types for snapshots, accessibility preferences, and process events.
- [ ] T011 [P] Provide builder/serializer utilities in `packages/shared/src/diagnostics/factories.ts` for tests and serialization.
- [ ] T012 Implement diagnostics snapshot builder service in `apps/backend/src/services/diagnostics/snapshot.service.ts`, collecting process stats, disk usage, and llama.cpp probe status.
- [ ] T013 Create retention + disk warning scheduler in `apps/backend/src/infra/logging/retention.ts`, pruning JSONL files beyond 30 days and triggering 500 MB warnings via IPC.
- [ ] T014 Wire Fastify routes in `apps/backend/src/api/diagnostics/routes.ts` for summary (GET) and refresh (POST) using shared models and services.

## Phase 3.4: Desktop Shell & IPC
- [ ] T015 Build Electron main diagnostics manager in `apps/desktop/src/main/diagnostics/index.ts` orchestrating backend-child lifecycle, crash dialogs, and retention warnings.
- [ ] T016 [P] Implement preload bridge `apps/desktop/src/preload/diagnostics.ts` exposing typed IPC channels for renderer requests/responses.
- [ ] T017 [P] Add renderer-to-main IPC wiring in `apps/desktop/src/ipc/diagnostics.ts`, routing requests to backend and emitting log export events.

## Phase 3.5: Renderer Experience
- [ ] T018 Compose landing page scaffold in `apps/frontend/src/pages/landing/index.tsx` rendering diagnostics overview, export CTA, and accessibility toggles.
- [ ] T019 [P] Build `DiagnosticsPanel` component displaying system status, llama.cpp probe indicator, and retention warnings in `apps/frontend/src/components/DiagnosticsPanel/DiagnosticsPanel.tsx`.
- [ ] T020 [P] Implement `AccessibilityToggles` component in `apps/frontend/src/components/AccessibilityToggles/AccessibilityToggles.tsx` persisting preferences via preload bridge.
- [ ] T021 Integrate renderer hooks (`apps/frontend/src/hooks/useDiagnostics.ts`) to poll diagnostics summary, react to refresh, and debounce requests while offline.

## Phase 3.6: Integration & Export Workflows
- [ ] T022 Connect renderer IPC calls to Fastify endpoints through preload bridge and Electron main routing, ensuring offline fallbacks and optimistic UI updates.
- [ ] T023 Implement JSONL export flow in `apps/backend/src/infra/logging/export.ts` and surface download dialog handling in `apps/desktop/src/main/diagnostics/export.ts`.
- [ ] T024 [P] Add llama.cpp health probe adapter in `apps/backend/src/services/diagnostics/probe.ts` with disabled/offline states aligned to spec.
- [ ] T025 [P] Instrument log retention warnings to surface in renderer toasts and accessibility-friendly alerts.

## Phase 3.7: Polish & Validation
- [ ] T026 Backfill unit tests for renderer hooks and IPC utilities (`apps/frontend/tests/unit/useDiagnostics.spec.ts`, `apps/desktop/tests/preload/diagnostics.spec.ts`).
- [ ] T027 Update documentation: extend `docs/architecture.md` diagnostics section, add runbook in `docs/diagnostics.md`, and record opt-in steps for remote LLMs.
- [ ] T028 Execute `quickstart.md` steps end-to-end, capturing screenshots/logs, and attach verification results in `docs/testing-log.md`.
- [ ] T029 Run full validation suite (Vitest across workspaces, Playwright accessibility, Electron smoke) and archive reports under `docs/reports/diagnostics/`.
- [ ] T030 Prepare release notes in `docs/release-notes/001-foundational-workspace-and.md` summarizing diagnostics feature readiness and outstanding follow-ups.

## Dependencies
- T001 → T002 → T003/T004
- Tests-first: complete T005–T009 before starting T010 or later tasks
- T010 blocks T011, T012, T014
- T012 blocks T014, T022, T024
- T013 blocks T025
- T015 blocks T016, T017, T023
- T016 blocks T020, T022
- T017 blocks T022, T023, T025
- T018 blocks T019, T020, T021
- T021 blocks T022, T025
- Integrations (T022–T025) must finish before validation tasks T026–T030

## Parallel Execution Examples
- Kick off T006, T007, T008, T009 together once T005 is underway—they touch distinct suites.
- After T010, execute T011 [P] while T012 progresses.
- During renderer buildout, run T019 [P] and T020 [P] in parallel once T018 is merged.
- Validation phase: T026 [P], T027, and T028 may run concurrently after integration completes.

## Validation Checklist
- [ ] All contract, integration, accessibility, and smoke tests exist and initially failed.
- [ ] Implementation tasks trace directly to shared models, backend routes, IPC bridges, and renderer UI.
- [ ] Parallel `[P]` tasks edit disjoint files to avoid conflicts.
- [ ] Documentation updated alongside code (runbook, release notes, testing log).
- [ ] Final validation suite executed with artifacts stored in `docs/reports/diagnostics/`.
