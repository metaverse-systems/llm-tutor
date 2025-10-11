# Tasks: Backend LLM Profile Operations

**Input**: plan.md, research.md, data-model.md, contracts/profile-api.md, quickstart.md  
**Branch**: 009-implement-backend-llm

## Execution Guidance
- Follow TDD: add or update failing tests before implementing functionality.
- Maintain ASCII when editing files; honour existing comments and formatting.
- Keep diagnostics correlation IDs flowing through responses and logs.
- Use shared schemas from `@metaverse-systems/llm-tutor-shared` to avoid drift.

## Task List

### Phase 0: Environment & Validation Setup
- **T001 ✅**: Ensure backend workspace dependencies are installed (`npm install` from repo root). *(apps/backend)*
- **T002 ✅**: Add Fastify plugin registration stub for profile routes to `apps/backend/src/index.ts`, wiring new `/api/llm/profiles` namespace without logic. *(apps/backend/src/index.ts)*

### Phase 1: Contract Tests (TDD, parallel-friendly) ✅ COMPLETE
- **T003 [P] ✅**: Author failing contract test for GET `/api/llm/profiles/` response envelopes validating redaction, diagnostics metadata, and ≤500 ms timing expectation. *(apps/backend/tests/contract/llm/list-profiles.contract.test.ts)*
- **T004 [P] ✅**: Author failing contract test for POST `/api/llm/profiles/` create flow covering validation errors, safe storage outage, and redaction rules. *(apps/backend/tests/contract/llm/create-profile.contract.test.ts)*
- **T005 [P] ✅**: Author failing contract test for PATCH `/api/llm/profiles/:id` update scenarios including validation, missing profile, and safe storage outage. *(apps/backend/tests/contract/llm/update-profile.contract.test.ts)*
- **T006 [P] ✅**: Author failing contract test for DELETE `/api/llm/profiles/:id` enforcing successor handling and alternate-not-found error. *(apps/backend/tests/contract/llm/delete-profile.contract.test.ts)*
- **T007 [P] ✅**: Author failing contract test for POST `/api/llm/profiles/:id/activate` covering previous active return and unknown profile error. *(apps/backend/tests/contract/llm/activate-profile.contract.test.ts)*
- **T008 [P] ✅**: Author failing contract test for POST `/api/llm/profiles/:id/test` verifying timeout at 30 s, provider error mapping, and diagnostics payload. *(apps/backend/tests/contract/llm/test-prompt.contract.test.ts)*
- **T009 [P] ✅**: Author failing contract test for POST `/api/llm/profiles/discover` ensuring deduplication, conflict flags, and discovery error paths. *(apps/backend/tests/contract/llm/auto-discover.contract.test.ts)*

### Phase 2: Integration Tests (TDD before implementation)
- **T010 [P]**: Update integration test for profile CRUD workflow to cover new HTTP routes and ensure diagnostics breadcrumbs emitted. *(apps/backend/tests/integration/llm/profile-crud.test.ts)*
- **T011 [P]**: Update integration test for auto-discovery to exercise `/discover` endpoint and validate conflict deduplication results. *(apps/backend/tests/integration/llm/auto-discovery.test.ts)*
- **T012 [P]**: Update integration test for provider prompt tests to include timeout, 401 mapping, and latency recording via HTTP routes. *(apps/backend/tests/integration/llm/test-prompt-providers.test.ts)*

### Phase 3: Core Implementation (Sequential where files overlap)
- **T013**: Implement Fastify plugin module `apps/backend/src/api/llm/profile.routes.ts` registering all profile endpoints with schema hooks and request validation. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T014**: Create error mapping utility translating service exceptions into `ProfileErrorCode` responses with HTTP status codes. *(apps/backend/src/api/llm/profile-error.mapper.ts)*
- **T015**: Implement GET `/` handler wiring to `ProfileService.listProfiles`, applying filters, redaction helpers, diagnostics timing, and safe-storage status responses. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T016**: Implement POST `/` handler orchestrating profile creation, safe-storage gating, diagnostics emission, and correlation IDs. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T017**: Implement PATCH `/:profileId` handler applying partial updates, conflict detection, and diagnostics metadata. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T018**: Implement DELETE `/:profileId` handler enforcing successor requirements, alternate validation, and diagnostics logging. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T019**: Implement POST `/:profileId/activate` handler delivering serialized activation and previous active ID response. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T020**: Implement POST `/:profileId/test` handler coordinating `TestPromptService`, enforcing 30 s timeout, capturing latency, and sanitizing outputs. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T021**: Implement POST `/discover` handler invoking discovery service, deduplicating providers, surfacing conflicts, and emitting diagnostics. *(apps/backend/src/api/llm/profile.routes.ts)*
- **T022**: Integrate plugin into backend bootstrap: update `apps/backend/src/index.ts` to register profile routes and pass required dependencies (profile service, test prompt service, discovery probe). *(apps/backend/src/index.ts)*
- **T023**: Extend `apps/backend/src/services/llm/profile.service.ts` to expose methods needed by new handlers (filters, successor validation, diagnostics metadata). *(apps/backend/src/services/llm/profile.service.ts)*
- **T024**: Update `apps/backend/src/services/llm/test-prompt.service.ts` to expose structured telemetry (latency breakdown, error codes) consumed by HTTP handler. *(apps/backend/src/services/llm/test-prompt.service.ts)*
- **T025**: Add discovery service orchestration module reusing `createLlmProbe` and exposing dedupe helpers for HTTP layer. *(apps/backend/src/services/llm/discovery.service.ts)*

### Phase 4: Diagnostics & Telemetry
- **T026 [P]**: Add diagnostics recorder integration ensuring each handler emits breadcrumb with correlation ID, result code, duration, and safe-storage status. *(apps/backend/src/api/llm/profile.routes.ts & diagnostics utilities)*
- **T027 [P]**: Update JSONL writer configuration/tests to include new LLM profile events if missing. *(apps/backend/src/infra/logging/diagnostics-logger.ts, tests)*

### Phase 5: Polish & Validation
- **T028 [P]**: Add unit tests covering error mapper, timeout enforcement, and diagnostics emission helpers. *(apps/backend/tests/unit/llm/profile-api-utils.spec.ts)*
- **T029 [P]**: Update documentation (`docs/llm-profiles.md`, `docs/diagnostics.md`) summarising backend endpoints, timeout rule, and diagnostics linkage. *(docs/llm-profiles.md, docs/diagnostics.md)*
- **T030**: Run full backend test suite (`npm run test --workspace @metaverse-systems/llm-tutor-backend`), capture results in `test.run`, and resolve any failures. *(apps/backend)*

## Parallel Execution Examples
```
# Contract tests can run in parallel once stubs exist
llm-task run T003
llm-task run T004
llm-task run T005
llm-task run T006
llm-task run T007
llm-task run T008
llm-task run T009

# Integration updates can proceed together after contracts
llm-task run T010
llm-task run T011
llm-task run T012

# Diagnostics polish tasks
llm-task run T026
llm-task run T027
llm-task run T028
llm-task run T029
```

## Dependencies & Notes
- Tasks within Phase 3 share `profile.routes.ts`; execute sequentially to avoid merge conflicts.
- Diagnostics tasks (T026-T027) depend on handlers existing (T015-T021).
- Documentation updates (T029) should reference final API shapes from implemented routes.
- Final validation (T030) requires all prior tasks complete and green tests.
