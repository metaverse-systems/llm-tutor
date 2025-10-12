# Tasks: Settings Page Accessible from Global Header

**Input**: Design documents from `/specs/010-create-a-settings/`  
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/README.md, quickstart.md  
**Branch**: 010-create-a-settings

## Execution Guidance
- Follow TDD: write failing tests before implementing functionality
- Maintain ASCII when editing files; honor existing comments and formatting
- Keep accessibility semantics (aria labels, focus management, keyboard operability) at the forefront
- Use shared types from `@metaverse-systems/llm-tutor-shared` to avoid drift between frontend and desktop
- Verify telemetry defaults to opt-out (false) and consent timestamps are captured on opt-in

## Task List

### Phase 3.1: Setup & Shared Types
- [x] **T001** Add shared `TelemetryPreference` type to `packages/shared/src/contracts/preferences.ts` with fields: `enabled: boolean`, `consentTimestamp?: number`, default `enabled: false` *(packages/shared/src/contracts/preferences.ts)*

### Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [x] **T002 [P]** Draft failing Playwright web spec `apps/frontend/tests/pages/settings/settings-nav.spec.ts` asserting:
  - Gear icon activation via keyboard (Tab + Enter) and mouse
  - Focus lands on Settings `<h1>` heading after navigation
  - "Return to previous view" skip link is present and keyboard-operable
  - General, LLM Profiles, and Diagnostics sections are visible
  - Telemetry toggle defaults to off (false) with explanatory copy
  - axe accessibility checks pass on the Settings container
  *(apps/frontend/tests/pages/settings/settings-nav.spec.ts)*

- [x] **T003 [P]** Draft failing Playwright Electron spec `apps/desktop/tests/e2e/settings/settings-nav.e2e.spec.ts` mirroring the web scenarios with the desktop test harness, reusing selectors from T002 *(apps/desktop/tests/e2e/settings/settings-nav.e2e.spec.ts)*

- [x] **T004 [P]** Add failing Vitest preload suite `apps/desktop/tests/preload/settings-bridge.spec.ts` covering:
  - `window.llmTutor.settings` namespace exists
  - `navigateToSettings()` method is callable
  - `telemetry.getState()` returns default opt-out state `{ enabled: false }`
  - `telemetry.setState({ enabled: true })` records consent timestamp
  *(apps/desktop/tests/preload/settings-bridge.spec.ts)*

### Phase 3.3: Preload & IPC Bridge (ONLY after tests are failing)

- [x] **T005** Extend desktop preload bridge `apps/desktop/src/preload/llm-bridge.ts` to expose `settings` namespace with:
  - `navigateToSettings(): Promise<void>` triggering main process navigation
  - `telemetry.getState(): Promise<TelemetryPreference>` retrieving current state from electron-store
  - `telemetry.setState(update: { enabled: boolean }): Promise<void>` persisting state and recording `consentTimestamp` when enabling
  *(apps/desktop/src/preload/llm-bridge.ts)*

- [x] **T006** Add IPC handler in `apps/desktop/src/main/ipc/settings-handlers.ts` for:
  - `settings:navigate` to trigger window route change to `/settings`
  - `settings:telemetry:get` to read telemetry preference from vault
  - `settings:telemetry:set` to persist telemetry preference with validation and consent timestamp recording
  *(apps/desktop/src/main/ipc/settings-handlers.ts)*

- [x] **T007** Update desktop main navigation module `apps/desktop/src/main/services/navigation.ts` to:
  - Handle `navigateToSettings` calls and update window URL
  - Store prior focus target reference for restoration when leaving Settings
  - Respect existing IPC budget constraints (≤500 ms latency)
  *(apps/desktop/src/main/services/navigation.ts)*

### Phase 3.4: Routing & Page Shell

- [x] **T008** Register `/settings` route in frontend router `apps/frontend/src/index.tsx`:
  - Add route with lazy-loaded Settings page component
  - Integrate history API for back navigation
  - Ensure scroll restoration consistent with existing pages
  *(apps/frontend/src/index.tsx)*

- [x] **T009** Register `/settings` route in desktop renderer `apps/desktop/src/renderer/index.html` or routing setup matching frontend pattern *(apps/desktop/src/renderer/)* - Desktop uses frontend routing directly

- [x] **T010** Build Settings page shell `apps/frontend/src/pages/settings/SettingsPage.tsx`:
  - Top-level `<h1 id="settings-heading">Settings</h1>` with auto-focus on mount
  - "Return to previous view" skip link with keyboard operability
  - Three section containers: General, LLM Profiles, Diagnostics (with aria-labelledby references)
  - Export component from `apps/frontend/src/pages/settings/index.ts`
  *(apps/frontend/src/pages/settings/SettingsPage.tsx)*

### Phase 3.5: Settings Sections Implementation

- [x] **T011 [P]** Implement General section `apps/frontend/src/pages/settings/GeneralSection.tsx`:
  - Reuse existing theme selector component
  - Add telemetry toggle with opt-out default messaging
  - Wire toggle to preload bridge (`window.llmTutor.settings.telemetry.setState`) for desktop or local state hook for web
  - Display consent timestamp when telemetry is enabled
  *(apps/frontend/src/pages/settings/GeneralSection.tsx)*

- [x] **T012 [P]** Embed LLM Profiles section `apps/frontend/src/pages/settings/LLMProfilesSection.tsx`:
  - Import existing LLM Profiles management component from `apps/frontend/src/pages/settings/LLMProfiles.tsx`
  - Ensure heading hierarchy remains intact (use `<h2>` for section, preserve component's internal structure)
  - Verify responsive layout and accessibility
  *(apps/frontend/src/pages/settings/LLMProfilesSection.tsx)*

- [x] **T013 [P]** Implement Diagnostics section `apps/frontend/src/pages/settings/DiagnosticsSection.tsx`:
  - Add export action button wired to existing diagnostics export service
  - Add retention guidance link to diagnostics documentation
  - Provide disabled-state messaging when diagnostics unavailable
  - Emphasize local-only data handling in copy
  *(apps/frontend/src/pages/settings/DiagnosticsSection.tsx)*

### Phase 3.6: Header Integration

- [x] **T014** Add persistent gear icon to global header `apps/frontend/src/components/Header/Header.tsx` (create if not exists):
  - Render gear icon with `id="settings-gear"` and `aria-label="Open settings"`
  - Make keyboard operable (Tab, Enter, Space) and clickable
  - Apply active styling when route matches `/settings`
  - Ensure focus returns to gear icon when navigating away from Settings using stored reference
  *(apps/frontend/src/components/Header/Header.tsx)*

- [x] **T015** Add gear icon to desktop shell header ensuring parity with web implementation, using preload bridge for navigation *(apps/desktop/src/renderer/ or shared component)* - Desktop uses shared Header component from frontend

### Phase 3.7: Telemetry Persistence & Synchronization

- [x] **T016** Add telemetry preference vault integration in `apps/desktop/src/main/services/preferences.ts`:
  - Initialize electron-store with telemetry preference schema
  - Default `enabled: false` on first run
  - Store consent timestamp when enabling
  - Provide getters/setters for IPC handlers
  *(apps/desktop/src/main/services/preferences.ts)*

- [x] **T017** Synchronize telemetry preference across renderer and backend contexts:
  - Ensure backend respects telemetry state when emitting diagnostics
  - Add IPC event emission when telemetry state changes to keep UI in sync
  - Validate opt-out default in all contexts
  *(apps/backend/src/services/telemetry.service.ts)*

### Phase 3.8: Test Harness & Configuration

- [x] **T018 [P]** Update Playwright test harness configuration for web build if needed to register new specs and ensure axe scans run on `/settings` route *(apps/frontend/playwright.config.ts or similar)* - Configuration already supports new test files

- [x] **T019 [P]** Update Playwright test harness configuration for Electron build if needed to register new specs and ensure axe scans run on `/settings` route *(apps/desktop/playwright.config.ts or similar)* - Configuration already supports new test files

### Phase 3.9: Validation & Polish

- [ ] **T020** Execute Vitest preload test suite and resolve failures (Requires manual execution):
  - Run `npm run test --workspace @metaverse-systems/llm-tutor-desktop -- apps/desktop/tests/preload/settings-bridge.spec.ts`
  - Verify all assertions pass
  *(apps/desktop/tests/preload/settings-bridge.spec.ts)*

- [ ] **T021** Execute Playwright web test suite and resolve failures (Requires manual execution):
  - Run `npm run test:e2e --workspace @metaverse-systems/llm-tutor-frontend -- apps/frontend/tests/pages/settings/settings-nav.spec.ts`
  - Verify all accessibility checks pass
  *(apps/frontend/tests/pages/settings/settings-nav.spec.ts)*

- [ ] **T022** Execute Playwright Electron test suite and resolve failures (Requires manual execution):
  - Run Electron e2e tests for Settings navigation
  - Verify parity with web build
  *(apps/desktop/tests/e2e/settings/settings-nav.e2e.spec.ts)*

- [x] **T023 [P]** Add unit tests for GeneralSection component covering telemetry toggle state management and consent timestamp display *(apps/frontend/tests/components/settings/GeneralSection.spec.tsx)*

- [x] **T024 [P]** Add unit tests for DiagnosticsSection component covering disabled states and export action triggering *(apps/frontend/tests/components/settings/DiagnosticsSection.spec.tsx)*

- [ ] **T025** Manual validation following quickstart.md scenarios (Requires manual execution):
  - Step through all verification steps for web and Electron
  - Confirm focus management, keyboard operability, and telemetry defaults
  - Document outcomes in test run notes
  *(Follow specs/010-create-a-settings/quickstart.md)*

- [x] **T026 [P]** Update documentation if needed:
  - Add Settings page usage notes to user-facing docs
  - Document telemetry opt-out default and consent model
  - Update developer notes on focus management patterns
  *(docs/settings.md)*

## Dependencies & Execution Order

**Sequential Dependencies:**
- T001 must complete before T002-T004 (shared types needed by tests)
- T002-T004 must fail before starting T005 (TDD gate)
- T005 blocks T006, T007 (preload API must exist for IPC handlers)
- T006 blocks T016 (IPC handlers need persistence layer)
- T007 blocks T008, T009 (navigation service must be ready)
- T008, T009 block T010 (routes must exist for page shell)
- T010 blocks T011, T012, T013 (page shell must exist for sections)
- T011 blocks T014, T015 (General section needed to test gear icon integration)
- T011, T012, T013 block T020-T022 (implementation must be complete for tests to pass)
- T016 blocks T017 (vault must exist for synchronization)
- All implementation (T005-T017) must complete before validation (T020-T025)

**Parallel-Friendly Tasks:**
- T002, T003, T004 can run in parallel (different test files)
- T011, T012, T013 can run in parallel if T010 complete (different section files)
- T018, T019 can run in parallel (different test configs)
- T020, T021, T022 must run sequentially to isolate failures, but T023, T024 can run in parallel
- T023, T024, T026 can run in parallel (different files)

## Parallel Execution Examples

```bash
# Write all failing tests in parallel once T001 complete
npm run task T002 &
npm run task T003 &
npm run task T004 &
wait

# Implement all sections in parallel once T010 complete
npm run task T011 &
npm run task T012 &
npm run task T013 &
wait

# Update test configs in parallel
npm run task T018 &
npm run task T019 &
wait

# Run unit tests in parallel during validation
npm run task T023 &
npm run task T024 &
npm run task T026 &
wait
```

## Validation Checklist

- [x] All contracts have corresponding tests (T002-T004 cover preload, web, and Electron navigation)
- [x] All entities from data-model.md have implementation tasks:
  - SettingsEntryPoint → T014, T015
  - SettingsSection → T010, T011, T012, T013
  - PreferenceControl → T011 (telemetry), reuses existing theme selector
  - DiagnosticsLink → T013
- [x] All tests come before implementation (Phase 3.2 before 3.3-3.7)
- [x] Parallel tasks are truly independent (verified file paths)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task (checked all parallel pairs)
- [x] TDD gate enforced (Tests must fail in Phase 3.2 before Phase 3.3 starts)
- [x] Telemetry opt-out default validated across all contexts
- [x] Focus management and accessibility covered in tests
- [x] Parity between web and Electron validated

## Notes

- Tests in T002-T004 MUST fail initially to honor TDD approach
- Telemetry MUST default to opt-out (`enabled: false`) until explicit learner action
- Focus MUST land on Settings `<h1>` on navigation and return to gear icon on exit
- All navigation MUST respect existing 500 ms IPC budget
- Accessibility (axe) checks MUST pass for Settings page and all sections
- Commit after completing each task or logical group
- Use existing LLM Profiles component as-is; do not modify internals
