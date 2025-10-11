
# Implementation Plan: LLM Profile IPC Handlers

**Branch**: `008-llm-profile-ipc` | **Date**: 2025-10-11 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/008-llm-profile-ipc/spec.md`

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
Implement a secure, type-safe Electron IPC bridge that mediates seven profile-management operations between renderer and main. Handlers must wrap ProfileService, TestPromptService, and AutoDiscoveryService logic, enforce schema validation, emit diagnostics breadcrumbs, block sensitive writes when safeStorage is unavailable, and return structured error responses within 500 ms (excluding network latency).

## Technical Context
**Language/Version**: TypeScript 5.5 across Electron main/renderer and Node.js 20 services  
**Primary Dependencies**: Electron 38 IPC layer, electron-store vault, Zod schema validation, Vitest, Playwright, axe-core  
**Storage**: Local electron-store JSON vault plus diagnostics JSONL in `app.getPath('userData')/diagnostics`  
**Testing**: Vitest (unit, contract), Playwright + axe-core (E2E/accessibility)  
**Target Platform**: Offline-first Electron desktop app for Windows/macOS/Linux operators  
**Project Type**: Multi-app web stack (backend + desktop shell + shared package)  
**Performance Goals**: ≤500 ms handler execution time per IPC request (excluding downstream network latency)  
**Constraints**: Must halt write operations when safeStorage encryption is unavailable, deliver structured error codes, maintain diagnostics coverage, and degrade gracefully while offline  
**Scale/Scope**: Single-tenant operations team managing tens of profiles with low concurrency (<10 simultaneous requests)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Plan surfaces renderer-facing status messaging with screen-reader-friendly copy, ensures keyboard-operable flows, and documents diagnostics visibility without exposing sensitive prompts.
- [x] **Local-First Privacy & Data Stewardship**: All profile data stays local, safeStorage outages block writes, and remote discovery opt-ins require diagnostics logging and consent checks.
- [x] **Transparent & Controllable AI Operations**: Bridge logs structured diagnostics, preserves audit trails, and propagates error codes that allow operators to trace model behavior.
- [x] **Quality-Driven TypeScript Web Delivery**: Strategy leverages typed IPC contracts, Vitest contract tests, Playwright E2E coverage, and keeps performance within consumer hardware budgets.

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
ios/ or android/
```
apps/
   backend/
      src/
         api/
         services/
         infra/
      tests/
   desktop/
      src/
         main/
            ipc/
            services/
            diagnostics/
         renderer/
            components/
            services/
      tests/
   frontend/
      src/
         components/
         services/
      tests/

packages/
   shared/
      src/
         contracts/
         schemas/
      tests/
```

**Structure Decision**: Multi-app TypeScript monorepo (backend + Electron desktop + frontend + shared package) with feature work concentrated in `apps/desktop/src/main/ipc` and shared schemas.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved. Key research topics already addressed:
- IPC handler security hardening (context isolation, channel naming, validation strategy)
- Diagnostics performance instrumentation and 500 ms timing budget enforcement
- SafeStorage outage handling patterns that avoid plaintext persistence
- Structured error code taxonomy aligned with renderer UX and accessibility accommodations

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, quickstart.md, and updated agent context capturing new IPC channel work. Contract tests will be scaffolded but marked pending until implementation.

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model creation task [P] 
- Each user story → integration test task
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
| _None_ | N/A | N/A |


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
- [x] Complexity deviations documented

---
*Based on Constitution v2.0.0 - See `/memory/constitution.md`*
