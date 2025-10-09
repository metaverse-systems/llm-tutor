
# Implementation Plan: Monorepo CSS/SCSS Formatting Workflow

**Branch**: `004-add-css-formatting` | **Date**: October 9, 2025 | **Spec**: [`specs/004-add-css-formatting/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/004-add-css-formatting/spec.md`

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
Ensure every workspace in the monorepo shares a single CSS/SCSS formatting policy backed by Prettier while adopting Tailwind CSS utilities, with contributor-friendly commands, documentation, and CI enforcement so styling remains consistent across backend, frontend, desktop, and shared packages.

## Technical Context
**Language/Version**: TypeScript 5.5 (all workspaces), Node.js 20 runtime  
**Primary Dependencies**: Prettier formatter, Tailwind CSS, PostCSS, workspace-specific build tooling (Vite, Fastify, Electron)  
**Storage**: N/A (tooling configuration only)  
**Testing**: Vitest, Playwright + axe-core, existing CI formatting checks  
**Target Platform**: Accessible web UI and Electron desktop shell on consumer hardware
**Project Type**: Web monorepo (backend + frontend + desktop + shared packages)  
**Performance Goals**: Formatting and Tailwind build commands should complete within existing CI budgets (<2 minutes end-to-end)  
**Constraints**: Must operate offline, align with local-first development, integrate with existing npm workspace scripts, avoid network-dependent CDN Tailwind builds  
**Scale/Scope**: Applies to all present and future CSS/SCSS/Tailwind assets across four workspaces

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Formatting enforcement and Tailwind guidance keep styling consistent for high-contrast themes and ensure contributors apply utilities that respect accessibility conventions. No remote services involved.
- [x] **Quality-Driven TypeScript Web Delivery**: Plan embeds formatter and Tailwind tooling into dev scripts and CI quality gates, complementing existing Vitest/Playwright suites to protect TypeScript workflows on consumer hardware.
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
├── backend/
│   ├── package.json
│   └── src/
├── desktop/
│   ├── package.json
│   └── src/
├── frontend/
│   ├── package.json
│   └── src/
packages/
└── shared/
   ├── package.json
   └── src/

.github/
└── workflows/ (CI formatting integration)

docs/
└── README.md, frontend quickstart sections for contributor workflow guidance
```

**Structure Decision**: Web monorepo with separate backend, frontend, desktop, and shared workspaces plus docs and CI configuration.

## Phase 0: Outline & Research
1. Resolve remaining questions from the technical context:
   - Confirm the shared Prettier file location and option set shared with TypeScript formatting.
   - Validate workspace orchestration (`npm run --workspaces`) for formatting commands.
   - Select Tailwind version, installation pattern (local dependency per workspace vs. root), and PostCSS pipeline hooks that remain offline.
   - Determine how CI exposes the formatter check and Tailwind build validation, and which documentation entries must be updated.

2. Summarise findings in `research.md` using the decision log format so future contributors understand both formatting and Tailwind policy.

3. Highlight any tooling impacts (e.g., Prettier cache usage, Tailwind build outputs, ignore patterns) that may influence subsequent implementation tasks.

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. Document the formatting policy, Tailwind profile, workspace command surfaces, and documentation touchpoints in `data-model.md`.

2. **Generate API contracts**: Not applicable (tooling feature with no external API surface).

3. **Generate contract tests**: Not applicable.

4. Extract integration scenarios from user stories and encode them as contributor walkthrough steps in `quickstart.md` (focus on running the formatter, Tailwind build steps, check mode, and validating CI behaviour).

5. **Update agent file incrementally** (O(1) operation):
    - Run `.specify/scripts/bash/update-agent-context.sh copilot`
       **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
    - If exists: Add only NEW tech from current plan (shared Prettier config, CSS/SCSS formatting workflow)
    - Preserve manual additions between markers
    - Update recent changes (keep last 3)
    - Keep under 150 lines for token efficiency
    - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

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

**Estimated Output**: 12-16 numbered, ordered tasks in tasks.md

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
