# Implementation Plan: LLM Connection Management

**Branch**: `007-llm-connection-management` | **Date**: 2025-10-10 | **Spec**: [`specs/007-llm-connection-management/spec.md`](./spec.md)
**Input**: Feature specification from `/home/tim/projects/metaverse-systems/llm-tutor/specs/007-llm-connection-management/spec.md`

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
Implement LLM connection profile management with CRUD operations, encrypted persistence in electron-store vault, auto-discovery of local llama.cpp instances, test prompt capability for validating connectivity, and an accessible Settings UI tab. Support local llama.cpp (default) and optional Azure AI Foundry with explicit consent dialogs. All profile operations, activations, and test prompts must be audited in diagnostics snapshots while maintaining WCAG 2.1 AA accessibility and consumer-hardware performance.

## Technical Context
**Language/Version**: TypeScript 5.5 across workspaces, Node.js 20 runtime for Electron main + backend  
**Primary Dependencies**: Electron 38, electron-store 9, Fastify 4, React 18, Vite 5, Zod (validation), Vitest, Playwright + axe-core  
**Storage**: electron-store JSON vault for profiles (API keys encrypted via electron-safeStorage when available); diagnostics JSONL exports unchanged  
**Testing**: Vitest (unit/contract), Playwright (E2E + accessibility), integration tests with mock llama.cpp/Azure servers  
**Target Platform**: Electron desktop app (macOS, Windows, Linux) with accessible React renderer, offline-first with optional remote LLM  
**Project Type**: Web monorepo (apps/backend, apps/frontend, apps/desktop, packages/shared)  
**Performance Goals**: Profile CRUD <500ms (excl. network I/O), test prompts <10s timeout, Settings UI 60fps interactions  
**Constraints**: WCAG 2.1 AA compliance, local-first privacy (remote opt-in only), consumer-grade hardware (no GPU required), electron-safeStorage fallback for missing keychains  
**Scale/Scope**: Unlimited profiles per user, single active profile, integration with existing diagnostics flow, blocks future curriculum generation features

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Learner-First Accessibility**: Settings UI must meet WCAG 2.1 AA (AR-001 through AR-006 in spec): form labels/IDs, keyboard navigation (Tab/Arrow/Enter/Delete), ARIA live regions for status, focus trap in consent dialog, high-contrast mode support, confirmation dialogs. Test prompt loading states announced to screen readers. All UI components themed via Feature 005 tokens.
- [x] **Curriculum Integrity & Assessment**: Not applicable—this feature provides infrastructure for future curriculum generation but does not generate educational content itself.
- [x] **Local-First Privacy & Data Stewardship**: Local llama.cpp is default; Azure AI Foundry requires explicit consent dialog (FR-007, DR-002). API keys encrypted via electron-safeStorage or stored unencrypted with user consent when keychain unavailable (FR-002, NFR-003). Diagnostics snapshots redact API keys (DR-001, DR-003). No learner data transmitted without opt-in.
- [x] **Transparent & Controllable AI Operations**: All profile CRUD, activations, and test prompts logged to diagnostics snapshots with timestamps, profile IDs, provider types (FR-008). Test prompt responses sanitized before rendering (SR-003). Users can switch providers at will and view connection history in diagnostics exports.
- [x] **Quality-Driven TypeScript Web Delivery**: TDD approach with contract tests (all backend endpoints), integration tests (mock llama.cpp/Azure servers), E2E tests (Playwright for all user scenarios), accessibility tests (axe for settings UI and consent dialog), unit tests (>90% coverage for profile service, encryption helpers, error mapping). Vitest for unit/contract, Playwright + axe for E2E/a11y. Consumer-hardware target maintained (no GPU, <500ms CRUD, 60fps UI).

*Based on Constitution v2.0.0 - See `.specify/memory/constitution.md`*

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
```
apps/
├── backend/
│   ├── src/
│   │   ├── api/llm/                    # New: LLM profile REST endpoints
│   │   ├── services/llm/               # New: Profile service, test prompt orchestrator
│   │   ├── infra/encryption/           # New: electron-safeStorage integration
│   │   └── index.ts
│   └── tests/
│       ├── contract/llm.contract.test.ts    # New: Profile endpoint contracts
│       └── integration/llm-providers.test.ts # New: Mock llama.cpp/Azure tests
│
├── frontend/
│   ├── src/
│   │   ├── pages/settings/             # New: Settings container with tabs
│   │   ├── components/LLMProfiles/     # New: Profile list, form, consent dialog
│   │   └── hooks/useLLMProfiles.ts     # New: Profile management hook
│   └── tests/
│       └── accessibility/llm-settings.spec.ts # New: Settings UI a11y tests
│
├── desktop/
│   ├── src/
│   │   ├── main/llm/                   # New: Encryption bridge, auto-discovery
│   │   ├── preload/llm.ts              # New: IPC bridge for profiles
│   │   └── ipc/llm.ts                  # New: IPC routing for profile APIs
│   └── tests/
│       └── main/llm-encryption.spec.ts  # New: encryption fallback tests
│
└── packages/shared/
    ├── src/
    │   ├── llm/                        # New: Profile types, Zod schemas
    │   └── index.ts
    └── tests/
        └── unit/llm-schemas.spec.ts    # New: Schema validation tests
```

**Structure Decision**: Web monorepo with new `/llm/` modules added to existing backend, frontend, desktop workspaces. Shared package exposes profile types/schemas consumed by all apps. Backend exposes Fastify routes, desktop bridges IPC + encryption, frontend renders Settings tab.

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

**Output**: research.md with all NEEDS CLARIFICATION resolved

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

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

**Status**: ✅ **COMPLETED**

**Artifacts Created**:
- ✅ `data-model.md`: 4 domain entities (LLMProfile, ProfileVault, TestPromptResult, ConsentRecord) with Zod schemas, validation rules, state transitions, service responsibilities, UI state management, diagnostics integration
- ✅ `contracts/api.md`: 7 IPC channels (list, create, update, delete, activate, test, discover) with request/response schemas, error codes, IPC bridge implementation, validation rules, security considerations
- ✅ `contracts/providers.md`: 3 provider contracts (llama.cpp, Azure OpenAI, custom) with HTTP endpoints, authentication, error mapping, request timeouts, response sanitization, example configurations
- ✅ `quickstart.md`: Complete contributor guide with setup (llama.cpp installation), usage workflows (5 scenarios), testing guide (unit/contract/integration/E2E/a11y), diagnostics validation, troubleshooting, code locations, contributor checklist
- ✅ Agent context updated: Ran `update-agent-context.sh copilot` → Added LLM profile tech stack to `.github/copilot-instructions.md`

**Validation**:
- All contracts specify request/response types with TypeScript interfaces
- Error codes mapped to user-friendly messages
- Security considerations documented (API key redaction, HTTPS enforcement, encryption fallback)
- Quickstart provides complete testing workflow from unit to accessibility tests
- Data model enforces "exactly one active profile" invariant
- Diagnostics events defined for all CRUD operations

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. **Parse Design Artifacts**:
   - Load `data-model.md` → Extract entities (LLMProfile, ProfileVault, TestPromptResult, ConsentRecord)
   - Load `contracts/api.md` → Extract 7 IPC endpoints with request/response schemas
   - Load `contracts/providers.md` → Extract 3 provider types with HTTP contracts
   - Load `quickstart.md` → Extract 5 user scenarios as acceptance criteria

2. **Generate Task Categories**:
   - **Foundation Tasks** (Parallel [P]):
     - Create Zod schemas (`packages/shared/src/llm/schemas.ts`)
     - Create type exports (`packages/shared/src/llm/types.ts`)
     - Write schema unit tests (`packages/shared/tests/llm/schemas.test.ts`)
   
   - **Infrastructure Tasks** (Sequential, depends on Foundation):
     - Implement EncryptionService (`apps/backend/src/infra/encryption/index.ts`)
     - Write encryption unit tests with mock safeStorage
     - Implement ProfileVault persistence (`apps/backend/src/services/llm/profile-vault.ts`)
     - Write vault unit tests (CRUD, invariants)
   
   - **Service Layer Tasks** (Sequential, depends on Infrastructure):
     - Implement ProfileService (`apps/backend/src/services/llm/profile.service.ts`)
     - Implement TestPromptService (`apps/backend/src/services/llm/test-prompt.service.ts`)
     - Implement AutoDiscoveryService (`apps/desktop/src/main/llm/auto-discovery.ts`)
     - Write service unit tests (mock HTTP clients, vault)
   
   - **IPC Layer Tasks** (Sequential, depends on Services):
     - Implement IPC handlers (`apps/desktop/src/main/llm/ipc-handlers.ts`)
     - Implement IPC bridge preload (`apps/desktop/src/preload/llm-bridge.ts`)
     - Write contract tests for all 7 endpoints
   
   - **UI Tasks** (Parallel [P], depends on IPC):
     - Create `useLLMProfiles` hook (`apps/frontend/src/hooks/useLLMProfiles.ts`)
     - Create Settings page (`apps/frontend/src/pages/settings/LLMProfiles.tsx`)
     - Create Profile form components (Add/Edit)
     - Create Profile list component with test button
     - Create delete confirmation dialog
     - Write component unit tests (React Testing Library)
   
   - **Integration Tasks** (Sequential, depends on UI + IPC):
     - Write integration tests for each scenario in quickstart.md
     - Write E2E tests (Playwright) for full workflows
     - Write accessibility tests (axe-core) for all UI components
   
   - **Diagnostics Tasks** (Parallel [P]):
     - Add LLM event types to diagnostics logger
     - Write diagnostics redaction tests (API key masking)
     - Update diagnostics export to include LLM events

3. **Task Ordering Rules**:
   - **TDD Approach**: Write tests before implementation (e.g., schema tests → schema implementation)
   - **Dependency Layers**: Foundation → Infrastructure → Services → IPC → UI → Integration
   - **Parallel Opportunities**: Mark independent tasks with [P] flag
     - All Foundation tasks (schemas, types, tests) can run parallel
     - UI components can be built in parallel once hook is complete
     - Diagnostics tasks are independent of main flow
   
4. **Task Template**:
   ```markdown
   ### Task N: [Category] - [Action]
   **Status**: ⏳ Pending / 🏗️ In Progress / ✅ Complete
   **Estimated Effort**: [XS/S/M/L/XL]
   **Dependencies**: Task #X, Task #Y
   **Parallel**: [P] or [Sequential]
   
   **Objective**: [One-sentence goal]
   
   **Steps**:
   1. [Concrete step with file path]
   2. [Verification command/test]
   
   **Acceptance Criteria**:
   - [ ] [Testable outcome]
   - [ ] [Code quality check]
   
   **References**:
   - data-model.md: [Section]
   - contracts/api.md: [Endpoint]
   - quickstart.md: [Scenario]
   ```

5. **Estimated Task Count**:
   - Foundation: 3-4 tasks (schemas, types, tests)
   - Infrastructure: 4-5 tasks (encryption, vault, tests)
   - Services: 6-7 tasks (ProfileService, TestPromptService, AutoDiscoveryService, tests)
   - IPC Layer: 4-5 tasks (handlers, bridge, contract tests)
   - UI: 8-10 tasks (hook, pages, components, unit tests)
   - Integration: 5-6 tasks (scenario tests, E2E, accessibility)
   - Diagnostics: 2-3 tasks (event types, redaction, export)
   
   **Total**: 32-40 tasks

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

The /tasks command will:
1. Load `.specify/templates/tasks-template.md`
2. Execute above strategy to generate numbered tasks
3. Output to `specs/007-llm-connection-management/tasks.md`
4. Include effort estimates, dependencies, and parallel flags

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
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (None - no violations)

---

## Plan Completion Summary

**Generated Artifacts**:
1. ✅ `research.md`: 5 research questions resolved (llama.cpp API, Azure OpenAI, electron-safeStorage, vault schema, test prompts)
2. ✅ `data-model.md`: 4 domain entities with Zod schemas, validation rules, state transitions (147 lines)
3. ✅ `contracts/api.md`: 7 IPC channels with request/response types, error codes, security considerations (412 lines)
4. ✅ `contracts/providers.md`: 3 provider contracts with HTTP endpoints, authentication, error mapping (281 lines)
5. ✅ `quickstart.md`: Complete contributor guide with setup, workflows, testing, troubleshooting (362 lines)
6. ✅ `.github/copilot-instructions.md`: Updated with LLM profile tech stack

**Design Decisions**:
- **Storage**: electron-store JSON vault with electron-safeStorage encryption (graceful plaintext fallback)
- **Active Profile**: Exactly one active enforced via service layer, atomic activation/deactivation
- **Auto-Discovery**: Probe ports 8080, 8000, 11434 on first launch (2s timeout, parallel with Promise.allSettled)
- **Test Prompts**: "Hello, can you respond?" with 10s timeout, TTFB latency, 500-char truncation
- **Consent**: Required for Azure/custom providers, stored as timestamp in profile
- **Diagnostics**: 7 event types logged to JSONL with API key redaction
- **Error Mapping**: User-friendly messages for network errors (ECONNREFUSED, ETIMEDOUT) and HTTP errors (401, 404, 429, 503)

**Implementation Strategy**:
- **TDD Approach**: Tests before implementation (unit → contract → integration → E2E → accessibility)
- **Dependency Layers**: Foundation → Infrastructure → Services → IPC → UI → Integration
- **Parallel Opportunities**: Foundation tasks (schemas, types), UI components, diagnostics tasks
- **Estimated Tasks**: 32-40 tasks across 7 categories

**Next Command**: `/tasks` to generate `tasks.md` with numbered, ordered tasks following the strategy defined in Phase 2.

---
*Based on Constitution v2.0.0 - See `specs/001-foundational-workspace-and/plan.md`*
