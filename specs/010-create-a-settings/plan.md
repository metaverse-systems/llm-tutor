
ios/ or android/
# Implementation Plan: Settings Page Accessible from Global Header

**Branch**: `010-create-a-settings` | **Date**: 2025-10-11 | **Spec**: specs/010-create-a-settings/spec.md
**Input**: Feature specification from `/specs/010-create-a-settings/spec.md`

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
Introduce a persistent gear icon in the global header that opens an in-app Settings route presenting grouped General, LLM Profiles, and Diagnostics sections with WCAG-aligned focus management, telemetry defaulting to opt-out, and parity between Electron desktop builds and the web development experience.

## Technical Context
**Language/Version**: TypeScript 5.5 across Electron main/preload, backend Fastify services, and React renderer on Node.js 20  
**Primary Dependencies**: React 18, Vite 5, Electron 38, Fastify 4, electron-store 9, Zod, shared contracts package  
**Storage**: Local electron-store vault for preferences and diagnostics JSONL exports (no new persistence layers)  
**Testing**: Vitest for unit coverage, Playwright + axe-core for e2e and accessibility, existing performance suites for IPC budgets  
**Target Platform**: Electron desktop shell with corresponding accessible browser build (dev server)  
**Project Type**: Multi-workspace web/Electron application (`apps/frontend`, `apps/desktop`, `apps/backend`, `packages/shared`)  
**Performance Goals**: Settings navigation must respect existing 500 ms IPC/service budgets; header interaction should not introduce layout thrash or route delays beyond current Vite/Electron transitions  
**Constraints**: Maintain WCAG 2.1 AA compliance, provide keyboard operability and focus-return paths, keep telemetry disabled until explicit opt-in, uphold offline-first behavior  
**Scale/Scope**: Single learner session with small profile lists (<50 entries) and diagnostics exports (<500 MB); no increase to concurrent user load or backend throughput expectations

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Plan centers on keyboard-operable navigation, focus management, aria-labeling, high-contrast parity, and reduced-motion friendly transitions for both Electron and web contexts.
- [x] **Local-First Privacy & Data Stewardship**: Telemetry remains opt-out by default with explicit disclosure text; no new remote LLM calls or data exports beyond local diagnostics links.
- [x] **Transparent & Controllable AI Operations**: LLM Profiles tooling stays embedded with existing audit/correlation flows, ensuring learners retain visibility into provider state from Settings.
- [x] **Quality-Driven TypeScript Web Delivery**: Strategy includes TDD with Vitest and Playwright (including axe), TypeScript contract reuse, and resource awareness suitable for consumer-grade hardware.

*Based on Constitution v2.0.0 - See `/memory/constitution.md`*

## Project Structure

### Documentation (this feature)
```

├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
apps/
├── backend/
│   ├── src/services/llm/
│   └── tests/{unit,contract,integration}/
├── desktop/
│   ├── src/main/llm/
│   ├── src/main/navigation/
│   ├── src/preload/
│   ├── src/renderer/
│   └── tests/{main,preload,performance,e2e}/
└── frontend/
    ├── src/components/
    ├── src/hooks/
    ├── src/pages/settings/
    └── tests/{components,hooks,pages,accessibility}/

packages/
└── shared/
    ├── src/contracts/
    ├── src/llm/
    └── tests/contracts/
```

**Structure Decision**: Multi-workspace Electron + web architecture; the feature updates frontend routing/components, desktop preload/main navigation wiring, and shared contracts only if new Settings data needs shared typing.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context**:
   - Determine best-practice focus management and return flow when routing to Settings within Electron and web shells.
   - Validate privacy-forward language for telemetry opt-out defaults and consent messaging.
   - Confirm Playwright + axe strategy for reusing Settings navigation tests across Electron runner and web dev server builds.

2. **Research tasks**:
   - Task: "Research focus management patterns for in-app Settings pages in React/Electron shells."
   - Task: "Research telemetry opt-out consent messaging that aligns with local-first privacy expectations."
   - Task: "Research Playwright plus axe-core techniques to validate shared navigation across Electron and web build targets."

3. **Consolidate findings** in `research.md` using:
   - Decision / Rationale / Alternatives considered entries referencing authoritative guidelines.

**Output**: `research.md` with unknowns resolved and supporting references noted.

## Phase 1: Design & Contracts
*Prerequisite: `research.md` completed*

1. **Extract entities from feature spec** → `data-model.md`:
   - Document `SettingsEntryPoint`, `SettingsSection`, and `PreferenceControl` entities with fields (label, ariaLabel, route, defaultState, active cues).
   - Capture telemetry preference lifecycle (default opt-out, opt-in timestamp) and diagnostics link availability rules.

2. **Contracts** (`contracts/`):
   - If no new IPC/HTTP calls are required, create `contracts/settings/README.md` describing reuse of existing profile and diagnostics contracts plus any preload typing updates.
   - If new methods arise (e.g., telemetry toggles), scaffold TypeScript contract definitions or JSON schemas and note integration points with shared packages.

3. **Contract tests**:
   - Author failing Playwright specs that assert navigation, focus, telemetry default state, and diagnostics link presence in both Electron and web contexts.
   - Add Vitest skeletons if preload typings or shared helpers demand unit-level validation.

4. **Test scenarios / quickstart**:
   - Derive scenarios from user stories: mouse activation, keyboard activation, section visibility, telemetry toggle, diagnostics link follow-up.
   - Document these in `quickstart.md` as reproducible validation steps for QA and regression runs.

5. **Agent context update**:
   - Run `.specify/scripts/bash/update-agent-context.sh copilot` after design docs are saved to record new focus areas and technology notes.

**Output**: `data-model.md`, `contracts/` artifacts, failing Playwright/Vitest placeholders, `quickstart.md`, updated agent context.

## Phase 2: Task Planning Approach
*To be executed by `/tasks`*

- Use design artifacts to enumerate tasks: write failing Playwright cases, update header component, extend routing, adjust preload/main wiring, update telemetry copy, and implement section content.
- Maintain TDD ordering (tests before implementation) and annotate independent efforts (e.g., frontend vs. desktop wiring) with `[P]` for parallel work.
- Expect ~18-22 tasks split across frontend navigation, shared typing updates, telemetry consent copy, diagnostics linkage, and automation coverage.

## Phase 3+: Future Implementation
- **Phase 3**: `/tasks` generates tasks.md and prioritizes TDD steps.
- **Phase 4**: Execute tasks, implementing UI, IPC adjustments, and tests.
- **Phase 5**: Run quickstart steps, Playwright suites, and regression tests to validate compliance.

## Complexity Tracking
| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|

## Progress Tracking
- **Phase Status**:
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
*Based on Constitution v2.0.0 - See `/memory/constitution.md`*
*This section describes what the /tasks command will do - DO NOT execute during /plan*
