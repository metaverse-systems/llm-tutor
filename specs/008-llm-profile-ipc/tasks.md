# Tasks: LLM Profile IPC Handlers

**Input**: Design documents from `/specs/008-llm-profile-ipc/`  
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md

## Phase 3.1: Setup
- [x] T001 Establish profile IPC test harness configuration by adding suite entries to `apps/desktop/vitest.config.ts` and aligning `apps/desktop/package.json` scripts for `contract`, `integration`, `e2e`, and `accessibility` runs.
- [x] T002 Scaffold test directory structure for profile IPC flows in `apps/desktop/tests/{contract,integration,e2e,accessibility}/profile-ipc/` with README placeholders describing required mocks.

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
- [x] T003 [P] Author failing contract tests that load `@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc` and assert request/response envelope schemas for all seven channels in `apps/desktop/tests/contract/profile-ipc/llm-profile-ipc.contract.test.ts`.
- [x] T004 [P] Write failing integration test covering "List Profiles" scenario (Scenario 1) that stubs `ProfileService` and asserts diagnostics + ≤500 ms duration in `apps/desktop/tests/integration/profile-ipc/list-profiles.integration.test.ts`.
- [x] T005 [P] Write failing integration test covering "Create Profile" happy path (Scenario 2) validating sanitized response fields in `apps/desktop/tests/integration/profile-ipc/create-profile.integration.test.ts`.
- [x] T006 [P] Write failing integration test for validation error handling (Scenario 3) expecting `VALIDATION_ERROR` copy and remediation text in `apps/desktop/tests/integration/profile-ipc/create-profile-validation.integration.test.ts`.
- [x] T007 [P] Write failing integration test simulating safeStorage outage (Scenario 4) expecting `SAFE_STORAGE_UNAVAILABLE` and blocked write log in `apps/desktop/tests/integration/profile-ipc/safe-storage-outage.integration.test.ts`.
- [x] T008 [P] Write failing integration test for test prompt telemetry (Scenario 5) verifying latency breakdown and diagnostics in `apps/desktop/tests/integration/profile-ipc/test-prompt.integration.test.ts`.
- [x] T009 [P] Write failing integration test for discovery dedup/conflict handling (Scenario 6) in `apps/desktop/tests/integration/profile-ipc/discover-providers.integration.test.ts`.
- [x] T010 [P] Write failing integration test verifying `dispose()` cleanup (Scenario 7) ensuring channels unregister in `apps/desktop/tests/integration/profile-ipc/dispose-lifecycle.integration.test.ts`.
- [x] T011 [P] Add failing Playwright end-to-end flow exercising list/create/test actions through renderer in `apps/desktop/tests/e2e/profile-ipc/profile-management.spec.ts`.
- [x] T012 [P] Add failing accessibility regression test using axe-core to validate error messaging and status banners in `apps/desktop/tests/accessibility/profile-ipc/error-messaging.accessibility.spec.ts`.

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [x] T013 Implement `ProfileIpcChannel`, `ProfileIpcEnvelope`, and `OperatorContext` Zod schemas in `packages/shared/src/contracts/llm-profile-ipc.ts` with exports wired in `packages/shared/src/contracts/index.ts`.
- [x] T014 Define `ProfileOperationRequest` union plus `ProfileListFilter`, `DraftProfile`, and `DiscoveryScope` schemas in `packages/shared/src/contracts/llm-profile-ipc.ts`.
- [x] T015 Implement `ProfileOperationResponse`, `ProfileErrorCode` enum, and shared response envelope helpers in `packages/shared/src/contracts/llm-profile-ipc.ts`.
- [x] T016 Add channel-specific response payload schemas (list/create/update/delete/activate/test/discover) and sanitization helpers in `packages/shared/src/contracts/llm-profile-ipc.ts`.
- [x] T017 Add `DiagnosticsBreadcrumb` and `SafeStorageOutageState` schemas plus correlation ID utilities in `packages/shared/src/contracts/llm-profile-ipc.ts` and export them for reuse.
- [x] T018 Implement safe-storage outage manager service handling state transitions and diagnostics hooks in `apps/desktop/src/main/services/safe-storage-outage.service.ts`.
- [x] T019 Implement diagnostics recorder for profile IPC events with rotation + warning thresholds in `apps/desktop/src/main/diagnostics/profile-ipc.recorder.ts`.
- [x] T020 Create typed IPC router scaffold registering seven channels and wiring dispose lifecycle in `apps/desktop/src/main/ipc/profile-ipc.router.ts` and integrate with `apps/desktop/src/main/ipc/index.ts`.
- [x] T021 Implement `llmProfile:list` handler with payload validation, service call, diagnostics emission, and ≤500 ms budget enforcement in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T022 Implement `llmProfile:create` handler with safeStorage gating, sanitization, and error mapping in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T023 Implement `llmProfile:update` handler handling partial changes, conflict detection, and diagnostics metadata in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T024 Implement `llmProfile:delete` handler enforcing successor selection and structured conflicts in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T025 Implement `llmProfile:activate` handler managing serialized activation and conflict codes in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T026 Implement `llmProfile:test` handler measuring service duration vs handler overhead and sanitizing prompt output in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T027 Implement `llmProfile:discover` handler executing parallel probes with deduplication and conflict detection in `apps/desktop/src/main/ipc/profile-ipc.router.ts`.
- [x] T028 Integrate safe-storage outage manager with ProfileService operations to block writes and queue retries in `apps/desktop/src/main/services/profile.service.ts`.
- [x] T029 Update renderer contextBridge client exposing typed IPC methods and structured error handling in `apps/desktop/src/renderer/services/profile-ipc.client.ts`.
- [x] T030 Update renderer profile management UI to surface accessible status messaging, remediation hints, and high-contrast safeStorage warnings in `apps/desktop/src/renderer/components/Settings/ProfileManager.tsx` (and related view models).
- [x] T031 Wire diagnostics recorder into existing diagnostics pipeline and JSONL writer in `apps/desktop/src/main/diagnostics/index.ts`.

## Phase 3.4: Integration
- [ ] T032 Connect diagnostics correlation IDs to global diagnostics export tooling and ensure rotation policy in `apps/desktop/src/main/diagnostics/diagnostics-manager.ts`.
- [ ] T033 Wire performance threshold warnings to existing notification/toast system in `apps/desktop/src/renderer/services/notifications.service.ts`.
- [ ] T034 Update auto-discovery backend integration to use shared discovery scope contract in `apps/desktop/src/main/services/auto-discovery.service.ts`.

## Phase 3.5: Polish
- [ ] T035 [P] Add shared schema unit tests covering edge cases for envelopes and error codes in `packages/shared/tests/contracts/llm-profile-ipc.schema.test.ts`.
- [ ] T036 [P] Add unit tests for safe-storage outage manager transitions and diagnostics emission in `apps/desktop/tests/unit/safe-storage-outage.service.spec.ts`.
- [ ] T037 [P] Add performance regression test keeping handler duration <500 ms with mocked services in `apps/desktop/tests/performance/profile-ipc.performance.spec.ts`.
- [ ] T038 [P] Update documentation (`docs/diagnostics.md`, `docs/llm-profiles.md`) with new IPC channels, error codes, and outage behaviors.
- [ ] T039 [P] Record manual QA outcomes for scenarios 1-7 in `docs/testing-log.md` following quickstart checklist.

## Dependencies
- T001 → T002 → Tests (T003–T012) → Core implementation (T013–T031) → Integration (T032–T034) → Polish (T035–T039).
- Tests T003–T012 must be written and failing before any of T013–T031 begin.
- Shared schema tasks (T013–T017) block safe-storage/diagnostics services (T018–T019) which in turn block router handlers (T020–T027).
- Router handler tasks (T021–T027) block service integration (T028) and renderer updates (T029–T030).
- Diagnostics wiring (T031) blocks integration polishing tasks (T032–T033).

## Parallel Execution Example
```
# Kick off contract + integration test authoring after setup completes
llm-task run T003
llm-task run T004
llm-task run T005
llm-task run T006
llm-task run T007
llm-task run T008
llm-task run T009
llm-task run T010
llm-task run T011
llm-task run T012
```

- [P] tasks denote parallel-safe work (different files, no shared dependencies).
- Ensure every [P] test still fails before moving to implementation.
