
# Implementation Plan: Backend LLM Profile Operations

**Branch**: `009-implement-backend-llm` | **Date**: 2025-10-11 | **Spec**: `specs/009-implement-backend-llm/spec.md`
**Input**: Feature specification from `/specs/009-implement-backend-llm/spec.md`

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
Implement reliable backend support for LLM profile management so the Electron desktop app can list, create, update, delete, activate, test, and auto-discover model profiles through Fastify HTTP endpoints. The backend must validate requests with shared IPC schemas, enforce safe-storage outage behaviour, surface accessible error messaging, emit diagnostics with correlation IDs, and ensure contract plus integration test suites pass to guarantee regression coverage.

## Technical Context
**Language/Version**: TypeScript 5.5 on Node.js 20 (backend workspace)  
**Primary Dependencies**: Fastify 4, Zod, electron-store (via profile vault), axios/fetch for provider probes  
**Storage**: Local electron-store JSON vault for LLM profiles plus diagnostics JSONL writer  
**Testing**: Vitest contract, integration, unit, and performance suites already scaffolded  
**Target Platform**: Electron desktop backend service running on learner devices (offline-first)  
**Project Type**: Web application split across `apps/backend`, `apps/desktop`, `packages/shared` workspaces  
**Performance Goals**: Profile list responses ≤500 ms, prompt test timeout at 30 s with latency metrics, diagnostics emission per request  
**Constraints**: Must block writes when safe storage unavailable, keep API keys redacted, operate without remote services unless explicitly configured  
**Scale/Scope**: Dozens of profiles per learner, concurrency limited to single desktop session with potential background auto-discovery probes

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Backend responses must include user-facing messages, remediation hints, and diagnostics correlation to power accessible UI banners; remote model usage remains opt-in with explicit consent timestamps preserved.
- [x] **Quality-Driven TypeScript Web Delivery**: Plan depends on TypeScript-first Fastify modules, extends Vitest contract/integration coverage, and keeps performance budgets aligned with consumer hardware by enforcing 500 ms list responses and 30 s prompt test ceilings.
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
```
apps/
   backend/
      src/
         api/
            diagnostics/
            llm/              # new Fastify plugin for profile routes
         services/
            llm/
               profile.service.ts
               profile-vault.ts
               test-prompt.service.ts
         index.ts
      tests/
         contract/llm/
         integration/llm/
         unit/

packages/
   shared/
      src/contracts/
      src/llm/

apps/
   desktop/
      src/main/ipc/
      src/main/llm/
```

**Structure Decision**: Multi-workspace TypeScript mono-repo; backend Fastify routes live under `apps/backend/src/api/llm`, reuse shared contracts from `packages/shared`, and align with existing desktop IPC services in `apps/desktop`.

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

**Output**: research.md (complete) summarising validation strategy, error mapping, diagnostics hooks, and discovery orchestration decisions.

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
   - Assert request/response schemas and diagnostic expectations
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

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file updated with new backend context

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

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md covering TDD steps for routes, services, diagnostics, and test suites

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
| _None_ |  |  |


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
