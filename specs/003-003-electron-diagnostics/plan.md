# Implementation Plan: Electron Diagnostics Export Automation

**Branch**: `003-003-electron-diagnostics` | **Date**: 2025-10-09 | **Spec**: [`specs/003-003-electron-diagnostics/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/003-003-electron-diagnostics/spec.md`

## Summary
Automate the Electron diagnostics export smoke test so it runs reliably in CI and local workflows. The plan focuses on resolving remote-debugging-port failures, hardening snapshot/export synchronization, unifying launcher scripts, and updating documentation plus validation logs to reflect the new CI-ready path while preserving accessibility guarantees.

## Technical Context
**Language/Version**: TypeScript 5.5 across Electron desktop + Playwright harness, Node.js 20 runtime  
**Primary Dependencies**: Electron 38, Playwright, Vite preview server, Vitest, axe-core  
**Storage**: Local filesystem only (diagnostics JSONL exports, preference vault)  
**Testing**: Playwright end-to-end (Electron + accessibility), Vitest for supporting modules  
**Target Platform**: Electron desktop shell packaged with local backend and renderer previews  
**Project Type**: Web monorepo (apps/backend, apps/frontend, apps/desktop, tests/e2e)  
**Performance Goals**: Export smoke test completes within 60 s; snapshot readiness detected within 30 s without flakiness  
**Constraints**: Offline-first execution, WCAG 2.1 AA accessibility, no remote LLM usage without opt-in, cross-platform (Linux/macOS/Windows) automation support  
**Scale/Scope**: Single-user desktop installs; CI pipelines on Linux runners and developer laptops

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] **Learner-First Accessibility**: Plan must preserve accessibility regression coverage and ensure automated flows verify keyboard/high-contrast/reduced-motion criteria.  
- [ ] **Local-First Privacy & Data Stewardship**: Plan must guarantee exports remain local-only, document storage locations, and keep automation offline.  
- [ ] **Transparent & Controllable AI Operations**: Plan must maintain diagnostics auditability by capturing export logs and surfacing automation results to learners/maintainers.  
- [ ] **Quality-Driven TypeScript Web Delivery**: Plan must outline automated tests (Playwright, Vitest) and resource expectations compatible with consumer hardware.

*Based on Constitution v2.0.0 - See `/memory/constitution.md`*

## Project Structure

### Documentation (this feature)
```
specs/003-003-electron-diagnostics/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
apps/desktop/
├── package.json
├── scripts/
│   └── ensure-dev-backend-lock.cjs
├── src/
│   ├── main/
│   ├── preload/
│   └── ipc/
└── tests/
    └── main/

apps/frontend/
├── src/
│   └── components/
└── tests/
    └── accessibility/

apps/backend/
└── tests/
    └── integration/

packages/shared/
└── src/
    └── diagnostics/

tests/e2e/
├── README.md
├── diagnostics/
│   └── export.spec.ts
└── tools/
    └── electron-launcher.cjs
```

**Structure Decision**: Continue using the existing web monorepo layout; automation changes span `tests/e2e`, `apps/desktop` scripts, and supporting packages plus documentation under `docs/`.

## Phase 0: Outline & Research
1. Inventory unknowns from Technical Context:
   - Cross-platform handling of Electron 38 remote-debugging-port requirements.
   - Playwright best practices for Electron app automation (snapshot readiness, save-dialog interception).
   - CI environment constraints (headless Linux runners, xvfb usage).
   - Accessibility regression expectations for diagnostics export flows.
2. Research tasks (document in `research.md`):
   - Decision: Port management strategy (dynamic allocation vs fixed).
   - Decision: Snapshot polling/backoff approach to reduce flakiness.
   - Decision: Export directory handling and log capture policy.
   - Decision: Accessibility verification scope during export automation.
3. Capture each finding with "Decision / Rationale / Alternatives" format and reference constitution principles where relevant. Ensure no [NEEDS CLARIFICATION] remain before advancing.

**Output**: `research.md` containing resolved decisions and supporting references.

## Phase 1: Design & Contracts
*Prerequisite: `research.md` complete*

1. **Data Model (`data-model.md`)**
   - Detail `ExportVerificationLog` structure (fields for status, timestamps, messages, accessibility indicators) and `DiagnosticsExportSnapshot` expectations.
   - Document relationships to existing diagnostics files (preference vault, snapshot service) and retention rules for automation artifacts.

2. **Contracts (`contracts/` directory)**
   - Define Playwright test contract scenarios (e.g., `diagnostics-export.contract.md` or `.yaml`) summarizing preconditions, steps, expected assertions.
   - If scripts expose CLI interfaces, capture their expected arguments/outputs.

3. **Test Skeletons**
   - Specify required failing tests: Playwright scenario adjustments, potential Vitest coverage for launcher utilities, optional contract tests for log parsing.
   - Outline mocks/stubs for Electron save dialogs and Vite preview readiness.

4. **Quickstart (`quickstart.md`)**
   - Provide step-by-step instructions for running the CI-aligned export test locally, including environment setup, command invocation, and troubleshooting (permissions, port conflicts, accessibility verification).

5. **Agent Context Update**
   - Run `.specify/scripts/bash/update-agent-context.sh copilot` and register newly introduced concepts (export automation script, dynamic debugging port allocation, Playwright Electron harness updates).

6. **Documentation Alignment**
   - Note required doc updates (diagnostics runbook, testing log, validation report templates) based on design decisions.

**Outputs**: `data-model.md`, contract files, test outlines, `quickstart.md`, updated agent context references.

## Phase 2: Task Planning Approach
*(To be executed by `/tasks` command; describe strategy only)*

- Use `.specify/templates/tasks-template.md` as the base.
- Derive tasks from Phase 1 artifacts:
  - Research decisions → setup tasks.
  - Contract definitions → Playwright/Vitest test tasks (marked [P] when parallelizable).
  - Data models → implementation tasks for log capture utilities or script updates.
  - Documentation requirements → doc update tasks.
- Ordering priorities:
  - Enforce TDD: create/adjust failing Playwright tests before code changes.
  - Update shared scripts and tooling prior to documentation to ensure accuracy.
  - Reserve final tasks for validation sweep and report updates.
- Expected output: 24–28 ordered tasks with dependencies and [P] indicators for parallel workstreams (e.g., documentation vs tooling).

## Phase 3+: Future Implementation
- **Phase 3**: `/tasks` command generates actionable task list.
- **Phase 4**: Implement tooling updates, Playwright adjustments, script integration, and documentation changes following TDD.
- **Phase 5**: Run full validation (Playwright export test, accessibility suites, Vitest) and archive updated diagnostics reports.

## Complexity Tracking
| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | – | – |

## Progress Tracking
**Phase Status**:
- [ ] Phase 0: Research complete (/plan command)
- [ ] Phase 1: Design complete (/plan command)
- [ ] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [ ] Initial Constitution Check: PASS
- [ ] Post-Design Constitution Check: PASS
- [ ] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v2.0.0 - See `/memory/constitution.md`*
