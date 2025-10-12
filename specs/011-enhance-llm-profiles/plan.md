
# Implementation Plan: LLM Profile Test Transcript

**Branch**: `011-enhance-llm-profiles` | **Date**: 2025-10-12 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/011-enhance-llm-profiles/spec.md`

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
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code, or `AGENTS.md` for all other agents).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Extend the LLM profile settings experience so that pressing "Test connection" reveals a keyboard-accessible transcript containing the learner’s prompt, the model response, latency, and status indicators. Back-end IPC and HTTP test endpoints return structured message histories (up to three exchanges) while diagnostics continue to redact sensitive details.

## Technical Context
**Language/Version**: TypeScript 5.5 across Electron desktop, Fastify backend, and React renderer; Node.js 20 runtime  
**Primary Dependencies**: Electron 38, React 18 + Vite 5, Fastify 4, electron-store 9, Zod validation, Vitest & Playwright test harnesses  
**Storage**: Local electron-store vault for LLM profiles plus diagnostics JSONL in `app.getPath("userData")/diagnostics`  
**Testing**: Vitest unit/contract/performance suites, Playwright E2E & accessibility (axe-core)  
**Target Platform**: Accessible Electron desktop app (Windows/macOS/Linux) with offline-first expectation  
**Project Type**: Web application with coordinated backend/frontend/desktop workspaces  
**Performance Goals**: Profile list/test handlers ≤500 ms (normal case); transcript rendering should remain >60 fps with up to three exchanges; backend test endpoint honors ≤30 s timeout  
**Constraints**: Maintain local-first privacy (redacted transcripts in diagnostics), keep transcript memory capped at three exchanges, ensure safe storage fallback messaging, maintain offline capability  
**Scale/Scope**: Single-learner desktop usage with occasional remote provider tests; expected transcript payload ≤1.5 kB per exchange

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Transcript panel will be focusable, aria-live announced, honors reduced motion, and integrates new Playwright + axe accessibility coverage for success/error flows.
- [x] **Local-First Privacy & Data Stewardship**: Test responses remain local, diagnostics redact transcripts to 500 characters, and remote provider calls continue to require explicit profile consent.
- [x] **Transparent & Controllable AI Operations**: Learners review prompt/response pairs and latency, with diagnostics preserving correlation IDs for auditability.
- [x] **Quality-Driven TypeScript Web Delivery**: Add contract/unit/front-end tests for new response shape, ensure Vitest + Playwright suites cover transcript history, and maintain lightweight rendering (≤3 exchanges) suitable for consumer hardware.

*Based on Constitution v2.0.0 - See `/memory/constitution.md`*

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->
ios/ or android/
```
apps/
├── backend/
│   ├── src/
│   │   ├── services/llm/
│   │   ├── routes/api/llm/
│   │   └── infra/logging/
│   └── tests/
│       ├── contract/llm/
│       ├── integration/llm/
│       └── performance/
├── desktop/
│   ├── src/
│   │   ├── main/llm/
│   │   ├── preload/
│   │   └── renderer/
│   └── tests/
│       ├── unit/
│       └── performance/
└── frontend/
   ├── src/
   │   ├── pages/settings/
   │   ├── components/
   │   └── hooks/
   └── tests/
      ├── components/
      └── accessibility/

packages/
└── shared/
   ├── src/contracts/llm-profile-ipc/
   └── tests/contracts/
```

**Structure Decision**: Multi-workspace Electron app with shared contracts; changes touch `apps/backend`, `apps/desktop`, `apps/frontend`, and `packages/shared` to keep IPC/HTTP contracts aligned.

## Phase 0: Outline & Research
1. Confirm transcript history limit (three exchanges) aligns with UX and performance goals; capture rationale for truncation and aria-live behavior drawing from WCAG guidance.
2. Review existing IPC/HTTP contracts for `llmProfile:test` to understand current payload shape and diagnostics redaction; document required schema extensions and truncation safeguards.
3. Benchmark front-end render cost of multi-line transcripts to validate virtual DOM approach and ensure no virtualization needed; record findings.

**Output**: `research.md` summarizing decisions on transcript retention, payload schema, diagnostics/privacy guardrails, and accessibility notifications.

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. Define data structures (`TestTranscript`, `TranscriptMessage`, latency/status metadata) and update state transitions for profile test runs in `data-model.md`.
2. Draft contract updates for IPC envelope and Fastify HTTP response in `/contracts/` (OpenAPI fragment + IPC TypeScript interfaces) emphasizing message arrays and truncation rules.
3. Sketch failing Vitest contract tests validating new schema across shared package and backend services; include diagnostics redaction assertions.
4. Outline front-end interaction flow in `quickstart.md` covering transcript toggle, aria-live messaging, and error remediation states.
5. Run `.specify/scripts/bash/update-agent-context.sh copilot` to record new focus areas (transcript history, accessibility announcements, contract updates).

**Output**: `data-model.md`, `/contracts/llm-profile-test-transcript.*`, updated agent context, failing contract/unit test stubs referenced in plan, and `quickstart.md` describing the verification flow.

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (IPC + HTTP contracts, data model, quickstart)
- Each contract → contract/unit test task [P]
- Each entity → persistence/service update task [P]
- Frontend story → accessibility + component test tasks
- Diagnostics/privacy requirements → logging update and verification tasks
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation 
- Dependency order: Models before services before UI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [ ] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v1.0.0 - See `/memory/constitution.md`*
