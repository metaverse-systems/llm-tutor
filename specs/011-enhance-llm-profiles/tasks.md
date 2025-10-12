# Tasks: LLM Profile Test Transcript

**Input**: Design documents from `/specs/011-enhance-llm-profiles/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/*.md|.yaml, quickstart.md
**Branch**: 011-enhance-llm-profiles

## Execution Guidance
- Follow TDD strictly: add or update failing tests before touching implementation files.
- Keep transcript history capped at three exchanges per profile as documented in data-model.md.
- Preserve local-first privacy: redact transcript previews in diagnostics and never persist raw API keys.
- Maintain accessibility: transcript panel must be keyboard focusable, aria-live announced, and respect reduced motion.
- Use shared types from `@metaverse-systems/llm-tutor-shared` to avoid schema drift between backend, IPC, and frontend consumers.

## Task List

### Phase 3.1: Shared & Contract Tests (write first, ensure failures)
- [ ] **T001** Extend `packages/shared/tests/llm/schemas.test.ts` with failing cases covering `TranscriptMessage` parsing, 500-character truncation flags, success/failure transcript requirements, and three-exchange history limits on `TestPromptResultSchema`.
- [ ] **T002 [P]** Update `packages/shared/tests/contracts/llm-profile-ipc.schema.test.ts` to assert the enriched `TestProfileResponseSchema`, including `transcript.status`, `messages[0].role`, `messages[0].truncated`, and sanitized metadata via `sanitizeDiagnosticsMetadata`.
- [ ] **T003 [P]** Amend `apps/backend/tests/contract/llm/test-prompt.contract.test.ts` so HTTP responses must return the structured transcript payload (success with two messages, error hiding transcript, timeout status mapping).
- [ ] **T004 [P]** Expand `apps/desktop/tests/contract/profile-ipc/llm-profile-ipc.contract.test.ts` to require the IPC `TestProfileResponseSchema` to surface transcript messages, latency/status chips, and omit transcript data for failures.
- [ ] **T005 [P]** Strengthen `apps/desktop/tests/integration/profile-ipc/test-prompt.integration.test.ts` to expect diagnostics breadcrumbs with `historyDepth`, redacted `messagePreview`, and transcript message arrays in the IPC success path.

### Phase 3.2: Backend Service & Diagnostics Tests (still pre-implementation)
- [ ] **T006** Extend `apps/backend/tests/unit/test-prompt.service.spec.ts` with failing assertions covering transcript generation (user/assistant pairing, truncation flags), rolling history of three exchanges, and cleared transcripts on failure.
- [ ] **T007 [P]** Update `apps/backend/tests/unit/diagnostics-logger.spec.ts` to verify transcript message sanitization, `historyDepth` metadata, and stable redaction of previews in logged events.

### Phase 3.3: Frontend Tests (last test gate before implementation)
- [ ] **T008** Enhance `apps/frontend/tests/components/LLMProfiles/TestConnectionButton.test.tsx` (or new companion spec) with failing expectations for transcript panel rendering, collapse/expand focus handling, aria-live messaging, and latency/status pill output.
- [ ] **T009 [P]** Author a failing Playwright web spec `apps/frontend/tests/pages/settings/llm-profile-transcript.spec.ts` asserting transcript history (latest-first, max three), truncation messaging, and axe-core accessibility on the transcript region.
- [ ] **T010 [P]** Mirror the Playwright coverage for Electron in `apps/desktop/tests/e2e/llm-profile-transcript.e2e.spec.ts`, validating keyboard navigation, aria announcements, and transcript clearing after profile switch.

> ⚠️ Do not proceed to implementation tasks until T001–T010 are in place and observed failing.

### Phase 3.4: Shared Schema & Contract Implementation
- [ ] **T011** Implement transcript types in `packages/shared/src/llm/schemas.ts` (`TranscriptMessageSchema`, `TestTranscriptSchema`, updated `TestPromptResultSchema`) and export them via `@metaverse-systems/llm-tutor-shared/llm`.
- [ ] **T012** Refine `packages/shared/src/contracts/llm-profile-ipc.ts` so `TestProfileResponseSchema` carries the new transcript structure, extend `sanitizeDiagnosticsMetadata` for `messagePreview`/`historyDepth`, and add helpers for transcript previews.
- [ ] **T013** Regenerate shared type exports (e.g., barrel files or generated d.ts) if required so desktop/frontend consumers receive the new transcript definitions without manual patching.

### Phase 3.5: Backend Transcript Pipeline
- [ ] **T014** Introduce an in-memory transcript cache (e.g., `apps/backend/src/services/llm/test-transcript.store.ts`) that stores up to three exchanges per profile with timestamps and truncation metadata.
- [ ] **T015** Refactor `apps/backend/src/services/llm/test-prompt.service.ts` to build `TranscriptMessage[]` from prompt/response, flag truncation, update the cache, and clear history on failure while preserving existing diagnostics hooks.
- [ ] **T016** Update `apps/backend/src/api/llm/profile.routes.ts` to return the cached transcript block with status/latency/remediation fields and surface `historyDepth` in diagnostics events.
- [ ] **T017** Enhance `apps/backend/src/infra/logging/diagnostics-logger.ts` to redact transcript messages (500-char limit), include `messagePreview`, and persist `historyDepth` metadata without exposing raw prompts.

### Phase 3.6: Desktop IPC & Diagnostics Integration
- [ ] **T018** Adjust `apps/desktop/src/main/ipc/profile-ipc.router.ts` to map backend transcripts into the IPC response, normalize previews, enrich breadcrumbs with `{ messagePreview, historyDepth }`, and respect request budget checks.
- [ ] **T019** Update `apps/desktop/tests/tools/profileIpcHarness.ts` (and related mocks) so overrides accept transcript payloads and align with the enriched contract.
- [ ] **T020** Ensure `apps/desktop/src/main/diagnostics/profile-ipc.recorder.ts` correctly sanitizes/saves transcript metadata with updated schema imports.

### Phase 3.7: Frontend State & UI Implementation
- [ ] **T021** Extend `apps/frontend/src/types/llm-api.ts` and `apps/frontend/src/hooks/useLLMProfiles.ts` to persist per-profile transcript history (max three), expose helpers for clearing on profile change, and propagate transcript + remediation details to callers.
- [ ] **T022** Introduce a dedicated transcript UI component (e.g., `apps/frontend/src/components/LLMProfiles/TestTranscriptPanel.tsx`) that renders message pairs with status chips, truncation badges, and controlled focus management.
- [ ] **T023** Refactor `apps/frontend/src/components/LLMProfiles/TestConnectionButton.tsx` to orchestrate the new component: handle loading/error states, manage collapse toggles, announce updates via aria-live, and keep retry prompt intact.
- [ ] **T024** Integrate the transcript panel within `apps/frontend/src/pages/settings/LLMProfiles.tsx`, including aria hooks, clearing behavior when switching profiles or closing dialogs, and live region updates referencing quickstart.md.
- [ ] **T025** Update styling in `apps/frontend/src/styles/tailwind.css` (and any scoped styles) to support the transcript container, status pills, reduced-motion transitions, and responsive layout without breaking existing classes.

### Phase 3.8: Playwright Harness & Accessibility Polish
- [ ] **T026 [P]** Adjust Playwright config or helpers (web) if new specs require registration, additional fixtures, or axe exclusions for the transcript region.
- [ ] **T027 [P]** Apply the equivalent harness tweaks for Electron Playwright runs, ensuring transcript specs execute in CI with deterministic seeds.

### Phase 3.9: Documentation & Validation
- [ ] **T028** Refresh `docs/llm-profiles.md` and `docs/diagnostics.md` to document transcript history, accessibility considerations, and redaction guarantees for diagnostics exports.
- [ ] **T029** Run focused unit suites and resolve failures:
  - `npm run test --workspaces @metaverse-systems/llm-tutor-shared @metaverse-systems/llm-tutor-backend @metaverse-systems/llm-tutor-frontend`
  - Confirm new transcript tests pass.
- [ ] **T030 [P]** Execute Playwright suites (web + Electron) covering the new specs and ensure axe scans remain green.
- [ ] **T031** Perform manual verification following `specs/011-enhance-llm-profiles/quickstart.md`, capture results in the testing log, and confirm transcripts clear when leaving the profile.

## Dependencies & Execution Order
- T001 must complete before any other test tasks; T002–T005 can proceed in parallel afterward.
- Finish T001–T010 (tests) before touching implementation tasks T011+.
- Shared schema updates (T011–T013) must land before backend or frontend code consumes new types.
- Backend cache/service work (T014–T017) must finish before desktop IPC integration (T018–T020).
- Frontend state/UI tasks (T021–T025) depend on updated IPC/HTTP payloads.
- Harness tweaks (T026–T027) should follow UI implementation but precede validation runs.
- Documentation and validation (T028–T031) close out the feature; do not mark complete until quickstart steps succeed.

## Parallel Execution Examples
```bash
# After T001, draft the remaining test scaffolds in parallel
npm run task T002 &
npm run task T003 &
npm run task T004 &
npm run task T005 &
wait

# Once shared schemas are in place (T011–T013), build backend transcript pipeline concurrently
npm run task T014 &
npm run task T015 &
npm run task T017 &
wait

# Run Playwright suites together after implementation
npm run test:e2e --workspace @metaverse-systems/llm-tutor-frontend &
npm run test:e2e --workspace @metaverse-systems/llm-tutor-desktop &
wait
```
