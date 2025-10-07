# Implementation Plan: Foundational Workspace & Diagnostics Scaffold

**Branch**: `001-foundational-workspace-and` | **Date**: 2025-10-07 | **Spec**: [`specs/001-foundational-workspace-and/spec.md`](./spec.md)
**Input**: Prep foundational diagnostics: backend health ping, renderer landing screen with accessibility toggles, Electron diagnostics modal. Enforce offline defaults, 30-day log retention with 500 MB warning, and constitutional mandates (WCAG 2.1 AA + quality-driven TypeScript delivery). Remote LLM usage remains opt-in only.

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `.github/copilot-instructions.md`).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command stops at step 9. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Deliver an offline-first diagnostics slice that ties together backend, frontend, and Electron shell so maintainers can view a diagnostics snapshot, toggle accessibility preferences, and export logs without hitting remote services. Backend Fastify endpoints expose health data, the renderer shows an accessible landing module, and the desktop shell manages lifecycle warnings plus JSONL log rotation honoring the 30-day / 500 MB policy.

## Technical Context
**Language/Version**: TypeScript 5.5 (workspaces), Node.js 20 (backend/Electron), React 18 (renderer).  
**Primary Dependencies**: Fastify 4, React 18 + Vite 5, Electron 38, electron-store, Zod, Vitest, Playwright + axe-core.  
**Storage**: Local filesystem (`app.getPath("userData")/diagnostics`) storing JSONL snapshots + lifecycle events; no external DB.  
**Testing**: Vitest (unit + contract), Playwright (renderer/Electron + accessibility), axe-core assertions, future smoke runs via electron runner.  
**Target Platform**: Electron desktop (Windows/macOS/Linux) with accessible Chromium renderer.  
**Project Type**: Web monorepo (`apps/backend`, `apps/frontend`, `apps/desktop`, `packages/shared`).  
**Performance Goals**: Diagnostics summary <1 s (FR-002); backend boot <5 s on consumer laptops; renderer stays 60 fps.  
**Constraints**: Offline-first, WCAG 2.1 AA (keyboard, high contrast, reduced motion), log retention 30 days with 500 MB warning, remote LLM disabled by default.  
**Scale/Scope**: Single-user desktop install; establishes baseline for future curriculum tooling.

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Plan sets keyboard focus order, high-contrast and reduced-motion toggles persisted through electron-store, and mandates Playwright + axe regression to enforce WCAG 2.1 AA. Diagnostics copy documents llama.cpp probe as optional, with remote providers opt-in only.  
  *Based on Constitution v2.0.0 - See `/memory/constitution.md`*
- [x] **Quality-Driven TypeScript Web Delivery**: TypeScript-first modules (shared models, Fastify routes, React components) with Vitest contract/unit coverage and Playwright e2e/accessibility checks keep performance within consumer hardware budgets.

## Project Structure

### Documentation (this feature)
```
specs/001-foundational-workspace-and/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
backend/
├── src/
│   ├── api/
│   │   └── diagnostics/
│   ├── services/
│   │   └── diagnostics/
│   ├── infra/
│   │   ├── logging/
│   │   └── preferences/
│   └── config/
└── tests/
    ├── contract/
    └── integration/

frontend/
├── src/
│   ├── pages/
│   │   └── landing/
│   ├── components/
│   │   ├── DiagnosticsPanel/
│   │   └── AccessibilityToggles/
│   └── hooks/
└── tests/
    ├── unit/
    └── accessibility/

desktop/
├── src/
│   ├── main/
│   │   └── diagnostics/
│   ├── preload/
│   └── ipc/
└── tests/

packages/
└── shared/
    └── src/
        └── diagnostics/

tests/
└── e2e/
    └── diagnostics/
```

**Structure Decision**: Web monorepo with coordinated backend, frontend, and Electron workspaces (`apps/backend`, `apps/frontend`, `apps/desktop`) plus shared TypeScript models in `packages/shared`. Diagnostics modules live inside the directories enumerated above.

## Phase 0: Outline & Research
- Completed research resolves: API transport (Fastify 4 with schema hooks), JSONL snapshot storage + pruning, electron-store preference sync, llama.cpp probe contract, and Electron dialog/export UX.
- `research.md` records each decision with rationale and alternatives; no open clarifications remain.

**Output**: `research.md`

## Phase 1: Design & Contracts
- Data entities (`DiagnosticsSnapshot`, `AccessibilityPreference`, `ProcessHealthEvent`) captured in `data-model.md` with validation notes.
- OpenAPI contract `contracts/diagnostics.openapi.yaml` defines `GET /internal/diagnostics/summary` and `POST /internal/diagnostics/refresh` schemas.
- Vitest contract tests in `apps/backend/tests/contract/diagnostics.contract.test.ts` currently fail, driving TDD.
- `quickstart.md` walks developers through booting workspaces, verifying accessibility toggles, refreshing diagnostics, and exporting logs.
- GitHub Copilot context update to be rerun after freezing this plan (`.specify/scripts/bash/update-agent-context.sh copilot`).

**Output**: `data-model.md`, `contracts/diagnostics.openapi.yaml`, `apps/backend/tests/contract/diagnostics.contract.test.ts`, `quickstart.md`

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do — do not execute during /plan.*

- **Task sources**: Functional requirements + Phase 1 artifacts feed tasks (contracts → backend endpoints, data model → shared types, quickstart → integration tests).
- **Test-first order**: Enhance existing failing contract tests; add renderer accessibility regression and Electron smoke tests before implementation.
- **Implementation sequence**:
  1. Shared domain models & Zod schemas (`packages/shared/src/diagnostics`).
  2. Backend diagnostics service, retention cron, and Fastify routes.
  3. Desktop process manager for lifecycle monitoring, snapshot export, crash dialogs.
  4. Renderer landing experience with accessibility toggles and diagnostics panel.
  5. Integration wiring: IPC channels, log rotation enforcement, download/export flow.
- **Polish & docs**: Update README diagnostics section, capture axe/Lighthouse output, document opt-in steps for remote LLMs.
- `/tasks` should emit ~25 ordered items, marking independent workstreams (e.g., frontend vs backend) with `[P]` for parallel execution.

## Phase 3+: Future Implementation
- **Phase 3**: `/tasks` command creates `tasks.md` mapping the sequence above.  
- **Phase 4**: Execute tasks, keeping tests green and constitution satisfied.  
- **Phase 5**: Run Vitest + Playwright suites, exercise quickstart walkthrough, confirm retention + accessibility.

## Complexity Tracking
No constitutional deviations required for this feature.

## Progress Tracking
**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command — describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v2.0.0 — See `/memory/constitution.md`*
