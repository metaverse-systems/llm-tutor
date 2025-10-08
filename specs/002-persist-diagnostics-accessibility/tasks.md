# Tasks: Persistent Diagnostics Preference Vault

**Input**: Design documents from `/specs/002-persist-diagnostics-accessibility/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Phase 3.1: Setup
- [x] T001 Scaffold diagnostics preference workspace directories (`apps/backend/src/api/diagnostics/preferences/`, `apps/backend/src/infra/preferences/`, `apps/desktop/src/main/diagnostics/preferences/`) and add placeholder exports in `packages/shared/src/diagnostics/index.ts` for upcoming schemas. *(No dependencies)*

## Phase 3.2: Tests First (TDD)
- [x] T002 [P] Create failing Vitest contract tests for `GET/PUT /internal/diagnostics/preferences` in `apps/backend/tests/contract/diagnostics-preferences.contract.test.ts` covering success, stale update, and storage-unavailable responses. *(Depends on T001)*
- [x] T003 [P] Add failing shared schema unit tests in `packages/shared/src/diagnostics/__tests__/preferences.schemas.spec.ts` validating `DiagnosticsPreferenceRecord`, `ConsentEventLog`, and `StorageHealthAlert` shapes. *(Depends on T001)*
- [x] T004 [P] Add failing Electron main-process unit tests in `apps/desktop/tests/main/preferencesVault.spec.ts` asserting vault bootstrap, write queueing, and storage-failure events. *(Depends on T001)*
- [x] T005 [P] Extend failing renderer hook tests in `apps/frontend/tests/unit/useDiagnostics.spec.ts` to expect persisted toggles, IPC updates, and storage warning handling. *(Depends on T001)*
- [x] T006 [P] Author failing Playwright scenario `apps/frontend/tests/accessibility/diagnostics-persistence.spec.ts` verifying restart persistence, consent messaging, and storage-failure fallback copy. *(Depends on T001)*
- [x] T007 [P] Introduce failing backend integration test in `apps/backend/tests/integration/diagnostics-preferences.integration.test.ts` covering Fastify route wiring and diagnostics snapshot export enrichment. *(Depends on T002)*

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [x] T008 [P] Implement `DiagnosticsPreferenceRecord` schema module in `packages/shared/src/diagnostics/preference-record.ts` with Zod validation and defaults. *(Depends on T003)*
- [x] T009 [P] Implement `ConsentEventLog` schema module in `packages/shared/src/diagnostics/consent-event.ts` with sliding-window helpers. *(Depends on T003)*
- [x] T010 [P] Implement `StorageHealthAlert` schema module in `packages/shared/src/diagnostics/storage-health.ts` with remediation helpers. *(Depends on T003)*
- [x] T011 Update `packages/shared/src/diagnostics/index.ts` to export new schemas and wire convenience builders consumed by backend/frontend. *(Depends on T008, T009, T010)*
- [x] T012 Implement Electron main preference vault in `apps/desktop/src/main/diagnostics/preferences/preferencesVault.ts` using `electron-store`, queued writes, and storage health tracking. *(Depends on T004, T008-T011)* *(Completed 2025-10-08; desktop Vitest suite passing.)*
- [x] T013 Update `apps/desktop/src/main/diagnostics/index.ts` to initialise the vault on app launch, inject stored preferences into diagnostics bootstrap, and broadcast updates. *(Depends on T012)* *(Completed 2025-10-08; desktop Vitest suite passing.)*
- [x] T014 Extend IPC channel definitions in `apps/desktop/src/ipc/diagnostics.ts` to expose `diagnostics:preferences:update` and `diagnostics:preferences:updated` handlers. *(Depends on T013)* *(Completed 2025-10-08; desktop Vitest suite passing.)*
- [x] T015 Update preload bridge in `apps/desktop/src/preload/diagnostics.ts` to forward preference update requests, subscribe to broadcasts, and expose storage health status. *(Depends on T014)* *(Completed 2025-10-08; desktop Vitest suite passing.)*
- [x] T016 Enhance renderer diagnostics hook in `apps/frontend/src/hooks/useDiagnostics.ts` to merge stored preferences, debounce refresh, and surface storage alerts. *(Depends on T015, T005)* *(Completed 2025-10-08; frontend Vitest suite passing.)*
- [x] T017 Update `apps/frontend/src/components/DiagnosticsPanel/DiagnosticsPanel.tsx` to display persistent toggle states, consent reminders, and storage warning UI copy. *(Depends on T016, T005)* *(Completed 2025-10-08; frontend Vitest passing, Playwright diagnostics run requires preview stub for persistence toggles.)*
- [x] T018 Implement backend preference adapter in `apps/backend/src/infra/preferences/index.ts` to read from Electron-managed vault via IPC/HTTP bridge with graceful fallbacks. *(Depends on T002, T008-T011)*
- [x] T019 Extend diagnostics snapshot service in `apps/backend/src/services/diagnostics/snapshot.service.ts` to embed preference records and storage alerts. *(Depends on T018, T007)*
- [x] T020 Add Fastify handler in `apps/backend/src/api/diagnostics/preferences/routes.ts` for GET/PUT preference endpoints respecting optimistic concurrency. *(Depends on T018, T002)*
- [x] T021 Register preference routes within `apps/backend/src/api/diagnostics/routes.ts` and ensure shared schema references compile. *(Depends on T020)*
- [x] T022 Refactor Electron dev harness script in `apps/desktop/package.json` (and related launch utilities) to prevent duplicate backend boot, using lock file + port probe per research decision. *(Depends on T013)* *(Completed 2025-10-08; desktop dev harness now guarded by lock-aware runner.)*

## Phase 3.4: Integration & Polish
- [ ] T023 Update diagnostics runbook `docs/diagnostics.md` with persistence workflow, storage-failure remediation, and consent audit instructions. *(Depends on T016-T021)*
- [ ] T024 Refresh architecture overview `docs/architecture.md` to document the preference vault module, IPC sync, and backend surface. *(Depends on T012-T021)*
- [ ] T025 Revise quickstart `specs/002-persist-diagnostics-accessibility/quickstart.md` and link to new Playwright scenario steps. *(Depends on T016-T021)*
- [ ] T026 Log validation outcomes in `docs/testing-log.md` after persistence regression passes. *(Depends on T027)*
- [ ] T027 Execute full validation sweep: Vitest across all workspaces, Playwright accessibility + persistence suites, and desktop smoke to confirm dev harness fix; record results under `docs/reports/`. *(Depends on T012-T026)*

## Dependencies
- T002 → T020 (contract tests drive route implementation)
- T003 → T008-T011 (shared schemas)
- T004 → T012 (main vault)
- T005 → T016-T017 (renderer UX)
- T006 → T016-T017 (persistence UX)
- T007 → T019 (snapshot enrichment)
- T012 → T013-T022 (main process wiring)
- T018 → T019-T021 (backend preferences)
- T023-T025 depend on implementation tasks T016-T021
- T027 depends on all prior tasks completing

