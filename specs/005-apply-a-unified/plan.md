
# Implementation Plan: Unified Visual Theme Rollout

**Branch**: `005-apply-a-unified` | **Date**: October 9, 2025 | **Spec**: [`specs/005-apply-a-unified/spec.md`](./spec.md)
**Input**: Feature specification from `/specs/005-apply-a-unified/spec.md`

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
Deliver a unified, accessible Tailwind-driven design system across the React frontend and Electron renderer. The effort standardizes brand tokens (color, typography, spacing, elevation, motion), migrates existing views away from bespoke class names, and documents contributor workflows so CI can enforce theming consistency.

## Technical Context
**Language/Version**: TypeScript 5.5 across workspaces, Node.js 20 runtime  
**Primary Dependencies**: React 18, Vite 5, Electron 38 renderer, Tailwind CSS 3, PostCSS, Prettier, Vitest, Playwright + axe-core  
**Storage**: Local filesystem (diagnostics JSONL, electron-store) — theming introduces no new storage  
**Testing**: Vitest unit suites, Playwright/axe accessibility tests, planned theme-specific visual checks  
**Target Platform**: Accessible web UI (frontend) and desktop Electron shell on consumer hardware  
**Project Type**: Web monorepo (apps/frontend, apps/desktop renderer, shared packages)  
**Performance Goals**: Maintain 60fps interactions, <200ms interactive updates when toggling theme states, zero regression in bundle size beyond +5%  
**Constraints**: Offline-first, WCAG 2.1 AA including high-contrast & reduced motion, Tailwind build must stay under 10s in CI, shared tokens versioned in Git  
**Scale/Scope**: Applies to current diagnostics landing flow, future learner modules, and desktop renderer shell (2 primary surfaces today)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: The plan enforces dedicated high-contrast token variants, validates reduced-motion behavior across React/Electron, and schedules Playwright + axe verifications for the themed UI. No remote LLM calls are introduced.
- [x] **Quality-Driven TypeScript Web Delivery**: Theme changes will be guarded by Vitest snapshot/unit updates, Playwright visual/a11y regressions, and lint/format commands wired into CI to keep consumer hardware performance unchanged.
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

ios/ or android/
### Source Code (repository root)
```
apps/
├── backend/
│   └── src/...
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── styles/tailwind.css
│   └── tests/
└── desktop/
      ├── src/
      │   ├── main/
      │   ├── preload/
      │   └── renderer/styles/tailwind.css
      └── tests/

packages/
└── shared/
      └── src/

tailwind.config.cjs (root shared configuration)
scripts/ (formatting + tailwind orchestration)
```

**Structure Decision**: Monorepo with dedicated frontend and Electron renderer sharing the root Tailwind config; plan touches Tailwind config, workspace scripts, and React/Electron view folders.

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

**Output**: research.md capturing baseline theme audit, token gaps, accessibility validation strategy, and CI enforcement approach.

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate theme contracts** (adapted from tooling focus):
   - Document token catalogue JSON schema and CSS variable mapping in `/contracts/theme.tokens.json`
   - Describe lint/CI enforcement expectations in `/contracts/theme-ci.md`

3. **Generate guardrail tests** derived from contracts:
   - Snapshot test stubs ensuring token JSON matches schema
   - Playwright/a11y scenario placeholders validating themed surfaces

4. **Extract test scenarios** from user stories:
   - Diagnostics landing page and Electron shell adopt theme
   - Accessibility toggles, high-contrast, and reduced-motion flows verified

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
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

**Estimated Output**: 16-20 numbered tasks covering token creation, component restyling, documentation, and CI enforcement.

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
- [ ] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented

---
*Based on Constitution v1.0.0 - See `/memory/constitution.md`*
