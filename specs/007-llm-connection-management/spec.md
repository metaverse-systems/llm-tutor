# Feature Specification: LLM Connection Management

**Feature Branch**: `007-llm-connection-management`  
**Created**: 2025-10-10  
**Status**: Draft  
**Input**: User description: "LLM connection management with test prompt capability"

This feature establishes the foundational layer for managing LLM API connections (local llama.cpp and optional remote providers), persisting connection configurations, and validating connectivity through simple test prompts. It prepares the backend for future curriculum generation while maintaining the project's local-first and accessibility principles.

## Clarifications

### Session 2025-10-10
- Q: When all auto-discovery probes fail on first launch, what should happen? → A: Skip profile creation entirely; user must add manually later
- Q: What happens when a user tries to delete the currently active profile? → A: Show warning dialog with option to activate alternate before deleting
- Q: Is there a maximum limit on the number of profiles a user can create? → A: No
- Q: When electron-safeStorage is unavailable (e.g., Linux without keyring daemon), how should API keys be stored? → A: Store unencrypted with prominent warning to user
- Q: Should profile names be unique, or can multiple profiles share the same display name? → A: Can duplicate; use UUID for identity

### What This Feature Includes
- **Connection Profile Management**: CRUD operations for LLM connection profiles (name, endpoint URL, API key, model identifier, provider type)
- **Profile Persistence**: Store connection profiles in the diagnostics preference vault (electron-store) with encrypted API keys
- **Connection Health Checks**: Extend existing LLM probe to perform deeper validation (model availability, response time, token limits)
- **Test Prompt Capability**: Simple "echo" or "hello world" prompt to validate end-to-end connectivity and measure latency
- **UI Integration**: Settings panel in the frontend/Electron renderer for profile management with accessible forms
- **Default Local Profile**: Auto-detect or pre-configure a local llama.cpp connection as the default
- **Remote Provider Support**: Azure AI Foundry profile as an optional, opt-in alternative with consent dialog
- **Audit Logging**: Log all profile changes, test prompts, and provider switches to diagnostics snapshots

### What This Feature Excludes
- **Curriculum Generation**: No prompt engineering for educational content (next feature)
- **Multi-Model Selection**: Single active profile at a time; multi-model orchestration deferred
- **Advanced Prompt Templates**: Only simple test strings; complex templating comes later
- **Streaming Responses**: Basic request/response only; streaming deferred to tutoring feature
- **Vector Store Integration**: RAG capabilities not in scope
- **Cost Tracking**: Token usage monitoring deferred

### Open Questions (NEEDS CLARIFICATION)
- **API Key Encryption**: Should we use electron-safeStorage or implement custom encryption? → **Decision**: Use `electron-safeStorage` for platform-native keychain integration
- **llama.cpp Auto-Discovery**: Should we scan common ports (8080, 8000) or require manual entry? → **Decision**: Scan common ports on first launch, allow manual override
- **Test Prompt Content**: Generic "Hello" or domain-specific "Explain photosynthesis in one sentence"? → **Decision**: Generic prompt with configurable text in settings
- **Profile Validation**: Validate on save or only when activating? → **Decision**: Validate on activation and provide manual "test connection" button
- **Concurrent Requests**: Block UI during test or allow queue? → **Decision**: Block with loading state for MVP, queue in future

## User Scenarios & Testing *(mandatory)*

### Scenario 1: First-Time Setup with Local LLM
**As a** learner installing LLM Tutor for the first time  
**I want to** configure my local llama.cpp endpoint  
**So that** I can verify the platform works offline before exploring features

**Acceptance Criteria**:
1. On first launch, diagnostics panel shows "No LLM connections configured"
2. User navigates to Settings → LLM Connections
3. Default profile template pre-fills with `http://localhost:8080` and provider type "llama.cpp"
4. User clicks "Test Connection" and sees loading indicator
5. Success: Green checkmark + model name + average latency displayed
6. Failure: Error message with troubleshooting link (e.g., "llama.cpp not running")
7. User saves profile, which becomes the active connection
8. Diagnostics panel updates to show "Connected to local-llama (llama.cpp)"

**Test Coverage**:
- E2E test in `tests/e2e/llm-connections/first-setup.spec.ts`
- Accessibility test for settings form keyboard navigation
- Contract test for `POST /internal/llm/profiles` endpoint
- Integration test for probe validation with mock llama.cpp server

### Scenario 2: Adding Azure AI Foundry as Secondary Provider
**As a** learner with intermittent local GPU access  
**I want to** configure an Azure AI Foundry fallback  
**So that** I can continue learning when my local runtime is unavailable

**Acceptance Criteria**:
1. User clicks "Add Remote Provider" in LLM settings
2. Consent dialog appears: "Remote providers send data to Microsoft Azure. Your prompts and responses will leave this device. [Learn More] [Cancel] [Accept & Continue]"
3. After accepting, form shows fields: Name, Endpoint URL, API Key (password field), Deployment Name, Model ID
4. User enters Azure credentials, clicks "Test Connection"
5. Backend validates against Azure OpenAI API, confirms model availability
6. Success: Profile saved as inactive; user must manually switch from local to Azure
7. Switch action logs preference change to diagnostics snapshot with timestamp
8. Settings panel shows active profile badge, inactive profiles grayed out

**Test Coverage**:
- E2E test with mocked Azure endpoint
- Unit test for consent state persistence
- Playwright accessibility test for consent dialog (focus trap, ARIA attributes)
- Integration test for provider switching and audit log entries

### Scenario 3: Troubleshooting Failed Connection
**As a** learner with a misconfigured endpoint  
**I want to** see detailed error messages and suggested fixes  
**So that** I can resolve connectivity issues without external support

**Acceptance Criteria**:
1. User attempts to test connection with invalid URL (e.g., `http://localhost:9999`)
2. Error message displays: "Connection failed: ECONNREFUSED. Is llama.cpp running on port 9999?"
3. Inline help text suggests: "Check llama.cpp is running with `ps aux | grep llama` and verify port in launch command"
4. If endpoint returns 404: "Endpoint found but no model at `/v1/completions`. Check API compatibility."
5. If timeout: "Request timed out after 10s. Increase timeout in advanced settings or check network."
6. All errors logged to diagnostics snapshot with full stack trace for export

**Test Coverage**:
- Unit tests for error message mapping (ECONNREFUSED, timeout, 404, 401, 500)
- Integration test simulating each failure mode with mock server
- Accessibility test ensuring error announcements are screen-reader friendly

### Scenario 4: Switching Active Providers
**As a** learner switching between local and cloud models  
**I want to** activate a different profile without losing configurations  
**So that** I can optimize for cost, speed, or privacy based on my current task

**Acceptance Criteria**:
1. Settings panel lists all saved profiles with "Active" badge on current selection
2. User clicks "Activate" on a different profile
3. Confirmation dialog (if switching to remote): "Switch to [Azure-GPT4]? Subsequent requests will use this provider."
4. After confirmation, profile becomes active, badge moves, diagnostics panel updates
5. Next test prompt uses the newly activated profile
6. Switch event logged with old/new provider names and timestamp

**Test Coverage**:
- E2E test for full activation flow
- Unit test for profile activation logic and preference persistence
- Integration test ensuring diagnostics snapshot includes switch event

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST persist LLM connection profiles in the diagnostics preference vault with fields: id (UUID), name, provider type (llama.cpp | azure | custom), endpoint URL, API key (encrypted), model ID, creation/modified timestamps; there is no maximum limit on the number of profiles a user can create; profile identity is determined by UUID, allowing multiple profiles to share the same display name
- **FR-002**: System MUST encrypt API keys using `electron-safeStorage` before persisting to vault; if `electron-safeStorage` is unavailable (e.g., Linux without keyring daemon), system MUST display a prominent warning dialog explaining that API keys will be stored unencrypted and allow the user to proceed or cancel profile creation
- **FR-003**: Backend MUST expose REST endpoints: `GET /internal/llm/profiles`, `POST /internal/llm/profiles`, `PUT /internal/llm/profiles/:id`, `DELETE /internal/llm/profiles/:id`, `POST /internal/llm/profiles/:id/activate`, `POST /internal/llm/profiles/:id/test`
- **FR-004**: System MUST maintain exactly one active profile at a time; activation MUST deactivate the previous profile atomically; deletion of the active profile MUST trigger a warning dialog allowing the user to select an alternate profile to activate before deletion completes, or cancel the deletion
- **FR-005**: Test prompt endpoint (`POST /internal/llm/profiles/:id/test`) MUST send a configurable test string (default: "Hello, can you respond?") and return: success boolean, response text (truncated to 500 chars), latency (ms), model name, error details if failed
- **FR-006**: On first launch, system MUST attempt to auto-discover local llama.cpp by probing `http://localhost:8080`, `http://localhost:8000`, `http://127.0.0.1:11434` (Ollama), and create a default profile if any respond; if all probes fail, system MUST NOT create any profile and user must manually add a profile via Settings
- **FR-007**: Remote provider activation MUST trigger a consent dialog in the renderer explaining data transmission; profile activation MUST NOT complete until user explicitly accepts
- **FR-008**: All profile CRUD operations, activations, and test prompts MUST append events to diagnostics snapshots with structure: `{ type: "llm_profile_created" | "llm_profile_activated" | "llm_test_prompt", timestamp, profileId, profileName, providerType, metadata }`
- **FR-009**: Settings UI MUST render an accessible form with labels, error messages, keyboard navigation, and focus management meeting WCAG 2.1 AA standards
- **FR-010**: System MUST handle connection timeouts gracefully (default 10s) and surface user-friendly error messages mapped from common HTTP/network errors

### Non-Functional Requirements
- **NFR-001**: Test prompt requests MUST complete within 10s or timeout with clear error
- **NFR-002**: Profile CRUD operations MUST complete within 500ms (excluding network I/O for test prompts)
- **NFR-003**: API key encryption/decryption MUST use platform-native keychains (macOS Keychain, Windows Credential Vault, Linux Secret Service) via `electron-safeStorage`; when platform keychain is unavailable, fallback to unencrypted storage with user consent
- **NFR-004**: Settings UI MUST maintain 60fps interactions during form edits and provider switches
- **NFR-005**: Consent dialog MUST be a focus trap with Escape key to cancel and Enter to accept
- **NFR-006**: All error messages MUST be logged to diagnostics and remain visible in UI until dismissed
- **NFR-007**: Profile list MUST support keyboard navigation (Tab, Arrow keys, Enter to activate, Delete key with confirmation)

### Accessibility Requirements *(WCAG 2.1 AA)*
- **AR-001**: Settings form MUST associate labels with inputs via `for`/`id` attributes
- **AR-002**: Test connection button MUST announce loading state to screen readers ("Testing connection to local-llama...")
- **AR-003**: Success/error messages MUST use ARIA live regions (`role="status"` or `role="alert"`)
- **AR-004**: Consent dialog MUST trap focus, announce purpose on open, and restore focus on close
- **AR-005**: Active profile badge MUST be perceivable in high-contrast mode (border, not color-only)
- **AR-006**: Profile deletion MUST require confirmation dialog with clear, keyboard-accessible controls; deleting the active profile MUST show a warning dialog with a list of alternate profiles to activate (if any exist) before deletion proceeds

### Data & Privacy Requirements
- **DR-001**: API keys MUST be encrypted at rest when platform keychain is available; when unavailable, API keys MAY be stored unencrypted with explicit user consent and warning; plaintext keys MUST NOT be logged or included in diagnostics exports regardless of encryption status
- **DR-002**: Remote provider profiles MUST store explicit consent timestamp and allow revocation
- **DR-003**: Diagnostics snapshots MUST redact API keys but include provider type, endpoint (hostname only), and connection success/failure
- **DR-004**: Profile export (if implemented) MUST exclude API keys and prompt user to re-enter after import
- **DR-005**: Consent dialog MUST link to a privacy policy document (markdown in `docs/privacy-llm.md`) explaining data handling per provider type

### Security Requirements
- **SR-001**: Backend MUST validate endpoint URLs to prevent SSRF (block private IP ranges for remote providers, allow localhost for local)
- **SR-002**: API key fields MUST use `type="password"` in UI and never echo to console/logs
- **SR-003**: Test prompt responses MUST be sanitized before rendering in UI to prevent XSS
- **SR-004**: Profile activation MUST validate profile existence and ownership before updating vault
- **SR-005**: Remote provider endpoints MUST use HTTPS; HTTP endpoints MUST require explicit user override with warning

## Out of Scope *(for this feature)*
- Multi-model conversations or simultaneous connections
- Streaming response support for test prompts
- Token usage tracking or cost estimation
- Custom provider plugins beyond llama.cpp/Azure
- Advanced prompt templating or variable substitution
- Model parameter tuning (temperature, top-p, max tokens)
- Vector store or RAG integration
- Profile sharing or team/organization management

## Dependencies & Integration Points
- **Depends On**: Feature 002 (diagnostics preference vault), Feature 005 (theme system for UI)
- **Integrates With**: Existing diagnostics snapshot service (append LLM events), Electron preload bridge (expose profile APIs), frontend settings panel (new tab)
- **Blocks**: Feature 007 (curriculum generation), Feature 008 (tutoring sessions)
- **External APIs**: llama.cpp `/v1/completions` or `/completion`, Azure OpenAI `/openai/deployments/{model}/completions` (API version 2023-05-15)

## Review & Acceptance Checklist
- [ ] All user scenarios have passing E2E tests (Playwright + axe)
- [ ] Contract tests cover all backend endpoints with Zod schema validation
- [ ] Integration tests validate llama.cpp and mocked Azure OpenAI interactions
- [ ] Unit tests achieve >90% coverage for profile service, encryption helpers, error mapping
- [ ] Accessibility audit (Playwright + axe) passes WCAG 2.1 AA for settings UI and consent dialog
- [ ] Manual QA confirms auto-discovery on fresh install (documented in quickstart)
- [ ] Privacy policy document (`docs/privacy-llm.md`) drafted and reviewed
- [ ] API key encryption verified using platform-native keychains on macOS/Windows/Linux
- [ ] Diagnostics snapshots include LLM profile events with sanitized data
- [ ] Documentation updated: `docs/architecture.md` (LLM layer), `docs/llm-setup.md` (new guide), `README.md` (usage section)
- [ ] Release notes drafted in `docs/release-notes/007-llm-connection-management.md`

## Execution Status
- [ ] Spec reviewed and approved
- [ ] Branch `007-llm-connection-management` created
- [ ] Implementation plan (`plan.md`) generated
- [ ] Research (`research.md`) completed
- [ ] Data model (`data-model.md`) defined
- [ ] Contracts (`contracts/`) authored
- [ ] Quickstart (`quickstart.md`) drafted
- [ ] Tasks (`tasks.md`) generated and executed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Feature merged to `main`
