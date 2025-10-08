# Implementation Plan: Persistent Diagnostics Preference Vault

**Branch**: `002-persist-diagnostics-accessibility` | **Date**: 2025-10-07 | **Spec**: [`specs/002-persist-diagnostics-accessibility/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/002-persist-diagnostics-accessibility/spec.md`

## Summary
Persist accessibility and remote-provider preferences in a resilient local vault so learners never lose their settings, even after restarts or storage hiccups. Centralise preference reads/writes in the Electron main process using a hardened `electron-store` wrapper, propagate changes across backend snapshots, renderer UI, and diagnostics exports within one second, and document offline-friendly recovery messaging plus the updated development harness expectations.

## Technical Context
**Language/Version**: TypeScript 5.5 across Electron backend/renderer, Node.js 20 runtime  
**Primary Dependencies**: Electron 38, React 18 + Vite 5, Fastify 4, electron-store 9, Zod, Vitest, Playwright + axe-core  
**Storage**: Local filesystem only — `electron-store` JSON vault for preferences, diagnostics JSONL exports in `app.getPath("userData")/diagnostics`  
**Testing**: Vitest (unit, contract, preload), Playwright (renderer + Electron harness), axe-core accessibility checks  
**Target Platform**: Electron desktop (Windows/macOS/Linux) with offline-first renderer  
**Project Type**: Web monorepo with `apps/backend`, `apps/frontend`, `apps/desktop`, `packages/shared`  
**Performance Goals**: Apply stored preferences within 500 ms of launch; cross-process sync broadcasts within 1 s; development harness boot remains <10 s  
**Constraints**: Offline by default, WCAG 2.1 AA compliance, no remote egress without consent, avoid double backend processes in dev harness  
**Scale/Scope**: Single-user desktop install; scope limited to diagnostics preferences and supporting docs/tests for this feature slice

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Plan enforces persisted high-contrast/reduced-motion toggles, screen-reader friendly failure messaging, and consent reminders before remote providers activate.  
  *Based on Constitution v2.0.0 - See `/memory/constitution.md`*
- [x] **Quality-Driven TypeScript Web Delivery**: Plan adds Vitest contract/unit coverage, Playwright restart regression, and keeps resource usage within consumer hardware limits.

## Project Structure

### Documentation (this feature)
```
specs/002-persist-diagnostics-accessibility/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
apps/backend/
├── src/
│   ├── api/
│   │   └── diagnostics/
│   │       ├── routes.ts
│   │       └── preferences/
│   ├── services/
│   │   └── diagnostics/
│   └── infra/
│       └── preferences/
└── tests/
    ├── contract/
    ├── integration/
    └── unit/

apps/desktop/
├── src/
│   ├── main/
│   │   └── diagnostics/
│   ├── preload/
│   │   └── diagnostics.ts
│   └── ipc/
│       └── diagnostics.ts
└── tests/
    └── preload/

apps/frontend/
├── src/
│   ├── components/
│   │   └── DiagnosticsPanel/
│   ├── hooks/
│   │   └── useDiagnostics.ts
│   └── pages/
│       └── landing/
└── tests/
    ├── accessibility/
    └── unit/

packages/shared/
└── src/
    └── diagnostics/

docs/
├── diagnostics.md
├── architecture.md
└── testing-log.md
```

**Structure Decision**: Web monorepo with coordinated backend, desktop, and renderer modules. Preference vault lives under `apps/desktop/src/main/diagnostics`, shared schemas under `packages/shared/src/diagnostics`, and documentation in `docs/`.

## Phase 0: Outline & Research
1. Inventory knowledge gaps from Technical Context: multi-process `electron-store` access patterns, storage failure UX copy, consent event retention, backend snapshot integration, and dev harness orchestration.
2. Capture findings in `research.md` using decision/rationale/alternatives format for:
   - Preference vault architecture (ownership, locking, encryption stance)
   - Sync strategy between main, preload, renderer, backend
   - Failure messaging playbook + accessibility guidelines
   - Consent logging expectations and audit surfaces
   - Dev harness single-backend enforcement pattern
3. Confirm no `[NEEDS CLARIFICATION]` remain; document resolved constraints and open follow-ups for later phases.

**Output**: `research.md` with five documented decisions and linked follow-ups.

## Phase 1: Design & Contracts
*Prerequisite: research.md complete*

1. **Data model (`data-model.md`)**
   - Detail `DiagnosticsPreferenceRecord`, `ConsentEventLog`, `StorageHealthAlert` fields, validation rules, defaulting behaviour, and relationships to existing snapshot schema.
   - Describe state machine for consent toggles (default off → confirmed opt-in → opt-out) and storage health severity levels.

2. **Contracts (`contracts/diagnostics-preferences.openapi.yaml`)**
   - Extend diagnostics surface with `GET /internal/diagnostics/preferences` and `PUT /internal/diagnostics/preferences` routes consumed by Electron main.
   - Document IPC channel contracts for preload ↔ renderer (`diagnostics:preferences:updated` broadcast and `diagnostics:preferences:update` invocation).
   - Annotate error responses for storage unavailability and conflict handling.

3. **Test Skeletons**
   - Specify Vitest contract test locations (`apps/backend/tests/contract/diagnostics-preferences.contract.test.ts`) asserting schemas fail until implemented.
   - Note preload/renderer unit specs ensuring sync, plus Playwright scenario for restart persistence and storage-failure fallback copy.

4. **Quickstart (`quickstart.md`)**
   - Provide walkthrough for enabling accessibility toggles, confirming persistence after restart, simulating storage failure, and verifying consent log entries in diagnostics export.
   - Include updated dev harness directions ensuring Electron manages backend.

5. **Agent Context**
   - Run `.specify/scripts/bash/update-agent-context.sh copilot` to register new concepts (electron-store vault, preference sync IPC, dev harness change) without duplicating existing entries.

## Phase 2: Task Planning Approach
*(for /tasks command; do not execute now)*

- Derive ~25 tasks covering: shared schema updates, `electron-store` wrapper, backend Fastify preference routes, preload bridge sync, renderer hook updates, tests (Vitest, Playwright), documentation changes, and dev harness script adjustments.
- Prioritise TDD order: failing contract/unit tests → desktop main/preload wiring → backend integration → renderer updates → docs.
- Mark parallelisable streams ([P]) for backend vs renderer work once shared types land.

**Estimated Output**: 26-28 ordered tasks in `tasks.md`.

## Phase 3+: Future Implementation
- **Phase 3**: `/tasks` command emits actionable checklist.
- **Phase 4**: Implement preference vault, sync logic, tests, docs, and dev harness fix.
- **Phase 5**: Run full Vitest suites, Playwright persistence regression, and updated quickstart to validate offline resilience.

## Complexity Tracking
No constitutional deviations required; preference vault remains local-only and within existing module boundaries.

## Progress Tracking
**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v2.0.0 - See `/memory/constitution.md`*
