# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 3.1: Setup
- [ ] T001 Scaffold TypeScript workspace structure per implementation plan (e.g., `apps/backend`, `apps/frontend`, `packages/shared`)
- [ ] T002 Initialize Node.js projects with npm workspaces, TypeScript config, and shared environment settings
- [ ] T003 [P] Configure ESLint, Prettier, testing frameworks (Vitest/Jest), Playwright, and accessibility tooling (axe, Lighthouse CI)
- [ ] T004 [P] Provision local storage primitives (SQLite/PostgreSQL migrations folder, vector store scaffolding) without implementation logic

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [ ] T005 [P] Contract test POST /api/curricula in apps/backend/tests/contract/curricula.contract.test.ts
- [ ] T006 [P] Contract test POST /api/assessments in apps/backend/tests/contract/assessments.contract.test.ts
- [ ] T007 [P] Integration test tutoring progression in apps/backend/tests/integration/tutoring-progress.test.ts
- [ ] T008 [P] Accessibility regression test for learner dashboard in apps/frontend/tests/accessibility/dashboard.spec.ts
- [ ] T009 [P] End-to-end offline smoke test using llama.cpp mock in tests/e2e/offline-smoke.spec.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T010 [P] Curriculum domain model in apps/backend/src/domain/curriculum.ts
- [ ] T011 [P] Assessment domain model and grading helpers in apps/backend/src/domain/assessment.ts
- [ ] T012 [P] Tutoring session service orchestrating LLM prompts in apps/backend/src/services/tutoring-session.ts
- [ ] T013 POST /api/curricula endpoint with local-first persistence in apps/backend/src/api/curricula.ts
- [ ] T014 POST /api/assessments endpoint with grading feedback in apps/backend/src/api/assessments.ts
- [ ] T015 Learner dashboard pages and progress visualizations in apps/frontend/src/pages/learner/
- [ ] T016 Accessibility enhancements (focus management, ARIA, motion toggles) in apps/frontend/src/components/
- [ ] T017 Logging and observability hooks capturing prompt metadata in apps/backend/src/infra/observability.ts

## Phase 3.4: Integration
- [ ] T018 Wire curriculum data layer to local relational DB with migrations and seed scripts
- [ ] T019 Connect vector store for RAG-based tutoring references
- [ ] T020 Implement model gateway supporting llama.cpp runtime with optional Azure AI Foundry adapter
- [ ] T021 Configure authentication/authorization (if applicable) and session management
- [ ] T022 Enforce security headers, CSP, and CORS policies consistent with local deployments

## Phase 3.5: Polish
- [ ] T023 [P] Unit tests for input validation in apps/backend/tests/unit/validation.spec.ts
- [ ] T024 Performance and load tests for curriculum generation pipeline (<200ms p95 local)
- [ ] T025 [P] Accessibility snapshot + Lighthouse report stored in docs/reports/
- [ ] T026 Update learner and developer documentation (docs/curriculum.md, docs/ai-backends.md)
- [ ] T027 Final manual QA script from quickstart.md, record outcomes in docs/testing-log.md

## Dependencies
- Tests (T005-T009) before implementation (T010-T017)
- T010 blocks T012-T014, T018
- T011 blocks T014, T018
- T012 blocks T019-T020
- T020 blocks T022
- Implementation before polish (T023-T027)

## Parallel Example
```
# Launch T005-T009 together:
Task: "Contract test POST /api/curricula in apps/backend/tests/contract/curricula.contract.test.ts"
Task: "Contract test POST /api/assessments in apps/backend/tests/contract/assessments.contract.test.ts"
Task: "Integration test tutoring progression in apps/backend/tests/integration/tutoring-progress.test.ts"
Task: "Accessibility regression test for learner dashboard in apps/frontend/tests/accessibility/dashboard.spec.ts"
Task: "End-to-end offline smoke test in tests/e2e/offline-smoke.spec.ts"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task
- Avoid: vague tasks, same file conflicts

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - Each contract file → contract test task [P]
   - Each endpoint → implementation task
   
2. **From Data Model**:
   - Each entity → model creation task [P]
   - Relationships → service layer tasks
   
3. **From User Stories**:
   - Each story → integration test [P]
   - Quickstart scenarios → validation tasks

4. **Ordering**:
   - Setup → Tests → Models → Services → Endpoints → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [ ] All contracts have corresponding tests
- [ ] All entities have model tasks
- [ ] All tests come before implementation
- [ ] Parallel tasks truly independent
- [ ] Each task specifies exact file path
- [ ] No task modifies same file as another [P] task