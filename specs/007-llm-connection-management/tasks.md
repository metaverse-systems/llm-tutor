# Tasks: LLM Connection Management

**Feature**: 007-llm-connection-management  
**Input**: Design documents from `/specs/007-llm-connection-management/`  
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

## Execution Flow
```
1. ✅ Load plan.md → Extract tech stack (TypeScript 5.5, Electron 38, React 18, Fastify 4, Zod, Vitest, Playwright)
2. ✅ Load data-model.md → 4 entities (LLMProfile, ProfileVault, TestPromptResult, ConsentRecord)
3. ✅ Load contracts/ → 7 IPC endpoints + 3 provider contracts
4. ✅ Load quickstart.md → 5 user scenarios for integration tests
5. ✅ Generate tasks by category: Setup → Tests → Core → Integration → Polish
6. ✅ Apply rules: Tests before impl (TDD), different files = [P], dependencies block parallel
7. ✅ Number tasks T001-T040
8. ✅ Validate: All contracts tested ✅, all entities modeled ✅, tests before impl ✅
9. → READY FOR EXECUTION
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no shared dependencies)
- Include exact file paths for all tasks

---

## Phase 3.1: Setup & Foundation

### T001: Scaffold shared LLM types and Zod schemas
**Status**: ✅ Completed (2025-10-10)  
**File**: `packages/shared/src/llm/schemas.ts`  
**Dependencies**: None  
**Parallel**: N/A (foundational)

**Notes**:
- Added provider-specific URL validation, consent requirements, and vault invariants per data model.

**Steps**:
1. Create `packages/shared/src/llm/schemas.ts`
2. Define Zod schemas from data-model.md:
   - `ProviderTypeSchema` (enum: llama.cpp, azure, custom)
   - `LLMProfileSchema` (id, name, providerType, endpointUrl, apiKey, modelId, isActive, consentTimestamp, createdAt, modifiedAt)
   - `ProfileVaultSchema` (profiles array, encryptionAvailable, version)
   - `TestPromptResultSchema` (profileId, success, promptText, responseText, latencyMs, errorCode, etc.)
   - `ConsentRecordSchema` (profileId, providerType, consentGranted, timestamp)
3. Export TypeScript types via `z.infer<typeof Schema>`
4. Add validation refinements:
   - Remote providers require `consentTimestamp !== null`
   - At most one profile can have `isActive: true` in vault

**Acceptance Criteria**:
- [x] All schemas match data-model.md field definitions
- [x] Exports include both Zod schemas and TypeScript types
- [x] No compilation errors

---

### T002: Create shared type exports barrel
**Status**: ✅ Completed (2025-10-10)  
**File**: `packages/shared/src/llm/index.ts`  
**Dependencies**: T001  
**Parallel**: N/A

**Notes**:
- Added a documented barrel export so consumers can import schemas via `@metaverse-systems/llm-tutor-shared/llm`.

**Steps**:
1. Create `packages/shared/src/llm/index.ts`
2. Re-export all types and schemas from `./schemas`
3. Add JSDoc comments for public API

**Acceptance Criteria**:
- [x] All schemas accessible via `@metaverse-systems/llm-tutor-shared/llm`
- [x] TypeScript auto-complete works in dependent workspaces

---

### T003 [P]: Unit tests for Zod schemas
**Status**: ✅ Completed (2025-10-10)  
**File**: `packages/shared/tests/llm/schemas.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅ (different file)

**Notes**:
- Added 21 Vitest cases covering success paths and validation failures for profiles, vaults, test results, and consent records.

**Steps**:
1. Create `packages/shared/tests/llm/schemas.test.ts`
2. Write Vitest tests validating:
   - Valid profile passes `LLMProfileSchema.parse()`
   - Invalid UUID rejected
   - Remote providers without `consentTimestamp` rejected
   - Profile vault with 2 active profiles rejected
   - Empty/whitespace names rejected
   - Invalid URLs rejected
3. Run: `npm --workspace @metaverse-systems/llm-tutor-shared run test`

**Acceptance Criteria**:
- [x] All tests pass
- [x] >90% coverage for schemas.ts
- [x] Tests verify both success and failure cases

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE IMPLEMENTATION

### T004 [P]: Contract test for List Profiles endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/list-profiles.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅ (independent contract test)

**Steps**:
1. Create `apps/backend/tests/contract/llm/list-profiles.contract.test.ts`
2. Mock IPC channel `llm:profiles:list`
3. Assert response structure matches `SuccessResponse<{ profiles, encryptionAvailable, activeProfileId }>`
4. Verify API keys redacted to `***REDACTED***`
5. Test error case: `VAULT_READ_ERROR`
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:contract`

**Expected**: ❌ Test MUST FAIL (no implementation yet)

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Request/response schemas match contracts/api.md
- [x] Error codes validated

---

### T005 [P]: Contract test for Create Profile endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/create-profile.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅ (independent contract test)

**Steps**:
1. Create test file
2. Mock IPC channel `llm:profiles:create`
3. Assert request validates: name, providerType, endpointUrl, apiKey, modelId, consentTimestamp
4. Assert response includes created profile with UUID
5. Test error cases: `VALIDATION_ERROR`, `VAULT_WRITE_ERROR`
6. Verify Azure/custom providers require `consentTimestamp`
7. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:contract`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Zod validation enforced
- [x] Consent requirement tested

---

### T006 [P]: Contract test for Update Profile endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/update-profile.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Mock IPC channel `llm:profiles:update`
3. Assert partial updates supported (only provided fields changed)
4. Test error cases: `PROFILE_NOT_FOUND`, `VALIDATION_ERROR`
5. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:contract`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Partial updates covered
- [x] Error codes validated

---

### T007 [P]: Contract test for Delete Profile endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/delete-profile.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Mock IPC channel `llm:profiles:delete`
3. Test request with `id` and optional `activateAlternateId`
4. Assert response includes `deletedId`, `newActiveProfileId`, `requiresUserSelection`
5. Test error cases: `PROFILE_NOT_FOUND`, `ALTERNATE_NOT_FOUND`
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:contract`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Request validates alternate handling
- [x] Error codes validated

### T008 [P]: Contract test for Activate Profile endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/activate-profile.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅
 
**Steps**:
1. Create contract test covering `llm:profiles:activate` channel
2. Assert success response includes `activeProfile` and optional `deactivatedProfileId`
3. Verify request validation rejects missing `id`
4. Validate error response for `PROFILE_NOT_FOUND`
5. Execute targeted contract suite (expected to fail pre-implementation)

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Response contracts validated against shared schemas
- [x] Error path for `PROFILE_NOT_FOUND` asserted

---

### T009 [P]: Contract test for Test Prompt endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/test-prompt.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Mock IPC channel `llm:profiles:test`
3. Assert response matches `TestPromptResult` schema
4. Verify fields: success, latencyMs, responseText (truncated 500 chars), errorCode
5. Test error cases: `NO_ACTIVE_PROFILE`, `TIMEOUT`, `ECONNREFUSED`
6. Execute contract suite (expected to fail pre-implementation)

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Response matches `TestPromptResult` schema (success and failure)
- [x] Network error codes mapped to contract values

---

### T010 [P]: Contract test for Auto-Discover endpoint
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/contract/llm/auto-discover.contract.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Created contract test validating success, no-discovery, and error responses for `llm:profiles:discover`
2. Added harness helpers to simulate discovery results and fatal errors
3. Ensured `force: true` payload supported and response shape matches contract
4. Documented diagnostics requirements for future implementation
5. Ran targeted Vitest contract suite (expected failure)

**Acceptance Criteria**:
- [x] Test fails with "handler not implemented"
- [x] Response schema assertion covers discovery flags and probed ports list
- [x] Error path for `DISCOVERY_ERROR` asserted

---

### T011 [P]: Integration test for auto-discovery scenario
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/integration/llm/auto-discovery.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Authored integration suite using `nock` to stub localhost probes across 8080/8000/11434
2. Exercised success path (port 8080 healthy) and failure path (all ports unavailable)
3. Verified vault mutations and active profile selection via list endpoint assertions
4. Required diagnostics capture through `readDiagnosticsEvents`
5. Added `nock` dev dependency and ambient module declaration for TypeScript
6. Executed focused test run (currently fails due to missing handler and pending dependency install)

**Acceptance Criteria**:
- [x] Test fails prior to implementation (`llm:profiles:discover` handler not implemented; dependency install still required)
- [x] Covers quickstart.md Scenario 1 (First Launch with Auto-Discovery)

---

### T012 [P]: Integration test for profile CRUD workflow
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/integration/llm/profile-crud.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Test workflow: Create profile → List profiles → Update profile → Activate → Delete
3. Assert "exactly one active" invariant enforced
4. Test deleting active profile requires alternate selection
5. Verify diagnostics events: `llm_profile_created`, `llm_profile_updated`, `llm_profile_activated`, `llm_profile_deleted`
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:integration`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Test fails pre-implementation (`llm:profiles:create` handler not implemented)
- [x] Covers quickstart.md Scenario 3 (Switching Active Profiles) and Scenario 4 (Deleting Active Profile)

---

### T013 [P]: Integration test for test prompt with mock providers
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/tests/integration/llm/test-prompt-providers.test.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Mock llama.cpp server: `/v1/completions` returns success with 234ms latency
3. Mock Azure OpenAI: `/chat/completions` returns 401 error
4. Test scenarios:
   - llama.cpp success → `TestPromptResult.success: true`, `latencyMs: 234`
   - Azure 401 → `errorCode: "401"`, `errorMessage: "Invalid API key"`
   - Timeout (10s) → `errorCode: "TIMEOUT"`
5. Verify response text truncated to 500 chars
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:integration`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Covers contracts/providers.md error mapping
- [x] Tests TTFB latency measurement

**Notes**:
- Added `test-prompt-providers.test.ts` exercising llama.cpp success, Azure 401 mapping, and timeout error handling with `nock` delays.
- Ensures response text truncation to 500 chars and asserts latency fields are populated.

---

### T014 [P]: Accessibility test for Settings UI
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/frontend/tests/accessibility/llm-settings.spec.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create Playwright test file
2. Navigate to Settings → LLM Profiles
3. Run `axe.run()` on profile list page
4. Assert 0 violations for WCAG 2.1 AA
5. Test keyboard navigation: Tab through profiles, Enter to activate, Delete key to delete
6. Verify ARIA labels: `role="list"`, `role="listitem"`, `aria-live="polite"` for status
7. Test focus trap in consent dialog
8. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test:a11y`

**Expected**: ❌ Test MUST FAIL (UI not implemented)

**Acceptance Criteria**:
- [x] Test fails (Settings page not found)
- [x] Validates AR-001 through AR-006 from spec

**Notes**:
- New Playwright accessibility suite audits axe violations, keyboard navigation order, and consent dialog focus trap expectations.
- Introduced helper to capture active element test IDs mirroring diagnostics accessibility coverage.

---

### T015 [P]: E2E test for profile creation workflow
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/desktop/tests/e2e/llm/create-profile.spec.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create Playwright E2E test
2. Launch Electron app in test mode
3. Navigate to Settings → LLM Profiles → Add Profile
4. Fill form: name="Azure OpenAI Prod", provider="azure", endpoint="https://...", apiKey="sk-test", model="gpt-4"
5. Accept consent dialog
6. Assert profile appears in list with "Encrypted" badge
7. Click "Test Connection" → verify success/error toast
8. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test:e2e`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Covers quickstart.md Scenario 2 (Manual Profile Creation)

**Notes**:
- Authored Electron Playwright workflow using diagnostics harness to navigate to LLM settings, create Azure profile, and trigger connection test status assertions.
- Asserts consent dialog entry, encrypted badge, and status region messaging to lock in UX contract.

---

### T016 [P]: E2E test for deleting active profile
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/desktop/tests/e2e/llm/delete-active-profile.spec.ts`  
**Dependencies**: T001  
**Parallel**: ✅

**Steps**:
1. Create Playwright E2E test
2. Setup: Create 2 profiles, activate Profile A
3. Click "Delete" on Profile A
4. Assert dialog: "Select an alternate profile to activate"
5. Select Profile B from dropdown
6. Click "Delete"
7. Assert Profile A removed, Profile B now active
8. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test:e2e`

**Expected**: ❌ Test MUST FAIL

**Acceptance Criteria**:
- [x] Covers quickstart.md Scenario 4 (Deleting Active Profile)

**Notes**:
- Authored Electron Playwright scenario that seeds two Azure profiles, forces one active, and verifies delete workflow requires selecting and activating an alternate profile.
- Ensures status messaging, active badge transfer, and consent dialog interactions remain under regression coverage.

---

## Phase 3.3: Core Implementation (ONLY after tests T004-T016 are failing)

### T017: Implement EncryptionService with electron-safeStorage
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/src/infra/encryption/index.ts`  
**Dependencies**: T003 (schema tests pass), T004-T016 failing  
**Parallel**: N/A

**Steps**:
1. Create `apps/backend/src/infra/encryption/index.ts`
2. Implement `EncryptionService` class:
   - `isEncryptionAvailable()`: Check `safeStorage.isEncryptionAvailable()`
   - `encrypt(plaintext: string): string`: Return base64-encoded ciphertext or plaintext with warning
   - `decrypt(ciphertext: string): string`: Decode and decrypt
3. Handle unavailable keychain: Return plaintext with warning flag
4. Add diagnostics event: `llm_encryption_unavailable` when fallback triggered
5. Write unit tests in `apps/backend/tests/unit/encryption.spec.ts` (mock safeStorage)
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [x] Unit tests pass (mock electron safeStorage)
- [x] Graceful fallback to plaintext when keychain unavailable (Linux headless)
- [x] Diagnostics event logged on fallback

**Notes**:
- Added dependency-free `SafeStorageAdapter` interface so Electron `safeStorage` can be injected at runtime while tests supply mocks.
- Exposed fallback diagnostics payloads (`llm_encryption_unavailable`) with structured metadata for future logger integration.
- Introduced backend `test:unit` npm script targeting `tests/unit` to keep encryption coverage fast and isolated.

**References**: data-model.md (EncryptionService), research.md (electron-safeStorage behavior)

---

### T018: Implement ProfileVault persistence with electron-store
**Status**: ✅ Completed (2025-10-10)  
**File**: `apps/backend/src/services/llm/profile-vault.ts`  
**Dependencies**: T017  
**Parallel**: N/A

**Steps**:
1. Create `apps/backend/src/services/llm/profile-vault.ts`
2. Initialize `electron-store` with schema:
   - Store path: `app.getPath('userData')/llm-profiles.json`
   - Schema: `ProfileVaultSchema` from T001
   - Default: `{ profiles: [], encryptionAvailable: false, version: "1.0.0" }`
3. Implement methods:
   - `loadVault(): ProfileVault`: Read from disk
   - `saveVault(vault: ProfileVault): void`: Atomic write
   - `getProfile(id: string): LLMProfile | null`
   - `addProfile(profile: LLMProfile): void`
   - `updateProfile(id: string, partial: Partial<LLMProfile>): void`
   - `deleteProfile(id: string): void`
4. Enforce invariant: At most one profile has `isActive: true`
5. Write unit tests in `apps/backend/tests/unit/profile-vault.spec.ts`
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [x] Unit tests pass
- [x] Atomic writes prevent corruption
- [x] "Exactly one active" invariant enforced

**Notes**:
- Implemented `ProfileVaultService` with electron-store persistence, in-memory fallback, and Zod-backed normalization.
- Added comprehensive Vitest suite (`apps/backend/tests/unit/profile-vault.spec.ts`) covering CRUD, invariant enforcement, and deduplication behavior.
- Updated shared package exports and repository TypeScript module resolution (`bundler`) so backend build and typings consume compiled declaration maps without rootDir conflicts.

**References**: data-model.md (ProfileVault), research.md (vault schema)

---

### T019: Implement ProfileService with CRUD operations
**Status**: ✅ Completed (2025-10-12)  
**File**: `apps/backend/src/services/llm/profile.service.ts`  
**Dependencies**: T018  
**Parallel**: N/A

**Steps**:
1. Create `apps/backend/src/services/llm/profile.service.ts`
2. Implement `ProfileService` class:
   - `listProfiles(): { profiles, encryptionAvailable, activeProfileId }`
   - `createProfile(payload): { profile, warning? }`: Encrypt API key via EncryptionService
   - `updateProfile(id, payload): { profile, warning? }`
   - `deleteProfile(id, activateAlternateId?): { deletedId, newActiveProfileId, requiresUserSelection }`
   - `activateProfile(id): { activeProfile, deactivatedProfileId }`
3. Validate all payloads with Zod schemas from T001
4. Log diagnostics events: `llm_profile_created`, `llm_profile_updated`, etc.
5. Redact API keys in responses (replace with `***REDACTED***`)
6. Write unit tests in `apps/backend/tests/unit/profile-service.spec.ts`
7. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [x] Unit tests pass (>90% coverage)
- [x] API keys redacted in list/read operations
- [x] Diagnostics events logged for all CRUD operations
- [x] Contract tests T004-T008 now pass ✅

**Notes**:
- Implemented full CRUD lifecycle with encryption fallback warnings, duplicate-name detection, and diagnostics events across create, update, delete, and activate flows.
- Added normalization helpers so list results are sorted active-first, trimmed consistently, and always redact API keys with the shared placeholder.
- Authored comprehensive unit coverage in `apps/backend/tests/unit/profile-service.spec.ts`, exercising consent validation, encryption failure paths, duplicate warnings, activation hand-offs, and deletion edge cases.

**References**: contracts/api.md (endpoints), data-model.md (ProfileService)

---

### T020: Implement TestPromptService with provider integration
**Status**: ⏳ Pending  
**File**: `apps/backend/src/services/llm/test-prompt.service.ts`  
**Dependencies**: T019  
**Parallel**: N/A

**Steps**:
1. Create `apps/backend/src/services/llm/test-prompt.service.ts`
2. Implement `TestPromptService` class:
   - `testPrompt(profileId?, promptText?): TestPromptResult`
   - Measure TTFB (time to first byte) and total latency
   - Send HTTP POST to profile endpoint:
     - llama.cpp: `/v1/completions` with `{ prompt, max_tokens: 100, temperature: 0.7 }`
     - Azure OpenAI: `/chat/completions` with `{ messages: [{ role: "user", content }] }`
   - Truncate response text to 500 characters
   - Map network/HTTP errors to user-friendly messages (see contracts/providers.md)
   - Handle 10s timeout
3. Return `TestPromptResult` with all fields populated
4. Log diagnostics event: `llm_test_prompt` with result
5. Write unit tests with mock HTTP client (nock/msw)
6. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [ ] Unit tests pass
- [ ] TTFB latency measured correctly
- [ ] Response text truncated to 500 chars
- [ ] Error mapping matches contracts/providers.md
- [ ] Contract test T009 now passes ✅
- [ ] Integration test T013 now passes ✅

**References**: contracts/providers.md (provider contracts), data-model.md (TestPromptService)

---

### T021: Implement AutoDiscoveryService for llama.cpp detection
**Status**: ⏳ Pending  
**File**: `apps/desktop/src/main/llm/auto-discovery.ts`  
**Dependencies**: T019  
**Parallel**: N/A

**Steps**:
1. Create `apps/desktop/src/main/llm/auto-discovery.ts`
2. Implement `AutoDiscoveryService` class:
   - `discover(force?: boolean): DiscoveryResult`
   - Probe ports 8080, 8000, 11434 in parallel using `Promise.allSettled()`
   - Each probe: GET `/health` with 2s timeout
   - Return first successful port or null if all fail
   - Cache results for 5 minutes (skip re-probe unless `force: true`)
   - If successful: Create default profile via ProfileService:
     - Name: "Local llama.cpp"
     - Endpoint: `http://localhost:{port}`
     - Provider: `llama.cpp`
     - API Key: "" (empty)
     - Active: `true`
3. Log diagnostics event: `llm_autodiscovery` with `discovered`, `discoveredUrl`, `probedPorts`
4. Write unit tests with mock HTTP servers
5. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test:unit`

**Acceptance Criteria**:
- [ ] Unit tests pass
- [ ] Parallel probes complete in ~2s (not 6s sequential)
- [ ] Cache prevents repeated probes
- [ ] Contract test T010 now passes ✅
- [ ] Integration test T011 now passes ✅

**References**: research.md (auto-discovery), quickstart.md (Scenario 1)

---

### T022: Implement IPC handlers for profile endpoints
**Status**: ⏳ Pending  
**File**: `apps/desktop/src/main/llm/ipc-handlers.ts`  
**Dependencies**: T019, T020, T021  
**Parallel**: N/A

**Steps**:
1. Create `apps/desktop/src/main/llm/ipc-handlers.ts`
2. Implement `registerLLMHandlers()` function
3. Register 7 IPC channels using `ipcMain.handle()`:
   - `llm:profiles:list` → `ProfileService.listProfiles()`
   - `llm:profiles:create` → `ProfileService.createProfile(payload)`
   - `llm:profiles:update` → `ProfileService.updateProfile(id, payload)`
   - `llm:profiles:delete` → `ProfileService.deleteProfile(id, activateAlternateId?)`
   - `llm:profiles:activate` → `ProfileService.activateProfile(id)`
   - `llm:profiles:test` → `TestPromptService.testPrompt(profileId?, promptText?)`
   - `llm:profiles:discover` → `AutoDiscoveryService.discover(force?)`
4. Wrap all responses in `SuccessResponse` or `ErrorResponse` format
5. Catch errors and return standardized error responses
6. Write integration tests in `apps/desktop/tests/main/llm-ipc-handlers.spec.ts`
7. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test:integration`

**Acceptance Criteria**:
- [ ] All 7 channels registered
- [ ] Error handling returns consistent format
- [ ] Integration test T012 now passes ✅
- [ ] All contract tests T004-T010 now pass ✅

**References**: contracts/api.md (IPC contracts)

---

### T023: Implement IPC bridge in preload script
**Status**: ⏳ Pending  
**File**: `apps/desktop/src/preload/llm-bridge.ts`  
**Dependencies**: T022  
**Parallel**: N/A

**Steps**:
1. Create `apps/desktop/src/preload/llm-bridge.ts`
2. Implement `llmAPI` object with methods:
   - `listProfiles(): Promise<Response>`
   - `createProfile(payload): Promise<Response>`
   - `updateProfile(payload): Promise<Response>`
   - `deleteProfile(payload): Promise<Response>`
   - `activateProfile(payload): Promise<Response>`
   - `testPrompt(payload): Promise<Response>`
   - `discoverProfiles(payload): Promise<Response>`
3. Each method calls `ipcRenderer.invoke()` with appropriate channel
4. Use `contextBridge.exposeInMainWorld()` to expose `llmAPI` to renderer
5. Add TypeScript types for all methods
6. Write preload tests in `apps/desktop/tests/preload/llm-bridge.spec.ts`
7. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test`

**Acceptance Criteria**:
- [ ] All methods typed correctly
- [ ] `window.llmAPI` accessible in renderer
- [ ] Preload tests pass

**References**: contracts/api.md (IPC bridge implementation)

---

### T024 [P]: Create useLLMProfiles React hook
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/hooks/useLLMProfiles.ts`  
**Dependencies**: T023  
**Parallel**: ✅ (different workspace)

**Steps**:
1. Create `apps/frontend/src/hooks/useLLMProfiles.ts`
2. Implement custom hook with state:
   - `profiles: LLMProfile[]`
   - `activeProfile: LLMProfile | null`
   - `loading: boolean`
   - `error: string | null`
   - `encryptionAvailable: boolean`
3. Implement methods:
   - `fetchProfiles(): Promise<void>`: Call `window.llmAPI.listProfiles()`
   - `createProfile(payload): Promise<LLMProfile>`
   - `updateProfile(id, payload): Promise<LLMProfile>`
   - `deleteProfile(id, alternateId?): Promise<void>`
   - `activateProfile(id): Promise<void>`
   - `testPrompt(profileId?, text?): Promise<TestPromptResult>`
   - `discoverProfiles(force?): Promise<DiscoveryResult>`
4. Handle loading/error states
5. Invalidate cache on mutations
6. Write unit tests in `apps/frontend/tests/hooks/useLLMProfiles.test.tsx` (React Testing Library)
7. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Unit tests pass
- [ ] Optimistic updates implemented
- [ ] Error handling comprehensive

**References**: data-model.md (UI state management)

---

### T025 [P]: Build Settings page with LLM Profiles tab
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/pages/settings/LLMProfiles.tsx`  
**Dependencies**: T024  
**Parallel**: ✅

**Steps**:
1. Create `apps/frontend/src/pages/settings/LLMProfiles.tsx`
2. Use `useLLMProfiles()` hook from T024
3. Render profile list with cards:
   - Display: name, provider type, endpoint (hostname only), active badge, encrypted badge
   - Actions: Activate button, Test Connection button, Edit button, Delete button
4. Add "Add Profile" button → opens ProfileForm component (T026)
5. Style with unified theme tokens from Feature 005
6. Ensure keyboard navigation: Tab through profiles, Enter to activate, Delete key to delete
7. Add ARIA labels: `role="list"`, `role="listitem"`, `aria-label="LLM connection profiles"`
8. Loading states with skeleton UI
9. Error states with user-friendly messages
10. Write component tests in `apps/frontend/tests/pages/LLMProfiles.test.tsx`
11. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Component tests pass
- [ ] Accessibility test T014 now passes ✅
- [ ] E2E tests T015-T016 now pass ✅
- [ ] Styled with theme tokens (no hardcoded colors)

**References**: quickstart.md (user workflows), spec.md (AR-001 through AR-006)

---

### T026 [P]: Build Profile form component (Add/Edit)
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/components/LLMProfiles/ProfileForm.tsx`  
**Dependencies**: T024  
**Parallel**: ✅

**Steps**:
1. Create `apps/frontend/src/components/LLMProfiles/ProfileForm.tsx`
2. Form fields:
   - Name (text input, required, 1-100 chars)
   - Provider (select: llama.cpp, Azure OpenAI, Custom)
   - Endpoint URL (text input, required, URL validation)
   - API Key (password input, required, 1-500 chars)
   - Model/Deployment (text input, optional for llama.cpp, required for Azure)
3. Client-side validation using Zod schemas from T001
4. If provider is Azure/Custom → show consent checkbox (required)
5. On submit: Call `createProfile()` or `updateProfile()` from hook
6. Display validation errors with `aria-describedby` linked to error messages
7. Focus management: Auto-focus first field on open, return focus on close
8. Write component tests
9. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Component tests pass
- [ ] Form validation enforces all rules from data-model.md
- [ ] Accessibility: Labels, error messages, focus management

**References**: contracts/api.md (Create/Update payloads), spec.md (AR-002)

---

### T027 [P]: Build consent dialog component
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/components/LLMProfiles/ConsentDialog.tsx`  
**Dependencies**: T024  
**Parallel**: ✅

**Steps**:
1. Create `apps/frontend/src/components/LLMProfiles/ConsentDialog.tsx`
2. Modal dialog with:
   - `role="alertdialog"`
   - Title: "Remote Provider Consent Required"
   - Body: "This profile connects to {provider}. Your prompts and data will be sent to remote servers. Do you consent?"
   - Actions: "Accept" (primary), "Cancel" (secondary)
3. Implement focus trap: Tab cycles within dialog, Escape closes
4. On Accept: Set `consentGranted: true`, record `consentTimestamp`, log diagnostics event `llm_consent_granted`
5. On Cancel: Set `consentGranted: false`, log `llm_consent_denied`
6. Styled with theme tokens
7. Write component tests
8. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Component tests pass
- [ ] Focus trap works correctly
- [ ] Diagnostics events logged

**References**: spec.md (FR-007, AR-005), data-model.md (ConsentRecord)

---

### T028 [P]: Build delete confirmation dialog
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/components/LLMProfiles/DeleteConfirmDialog.tsx`  
**Dependencies**: T024  
**Parallel**: ✅

**Steps**:
1. Create `apps/frontend/src/components/LLMProfiles/DeleteConfirmDialog.tsx`
2. Modal dialog:
   - If deleting active profile: Show dropdown to select alternate profile
   - If deleting inactive profile: Simple confirmation
   - Actions: "Delete" (danger), "Cancel"
3. Implement focus trap
4. On Delete: Call `deleteProfile(id, alternateId?)` from hook
5. Write component tests
6. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Component tests pass
- [ ] Alternate selection UI only shown for active profile

**References**: quickstart.md (Scenario 4), spec.md (FR-005)

---

### T029 [P]: Build test connection button with status display
**Status**: ⏳ Pending  
**File**: `apps/frontend/src/components/LLMProfiles/TestConnectionButton.tsx`  
**Dependencies**: T024  
**Parallel**: ✅

**Steps**:
1. Create `apps/frontend/src/components/LLMProfiles/TestConnectionButton.tsx`
2. Button triggers `testPrompt(profileId)` from hook
3. Display states:
   - Idle: "Test Connection"
   - Loading: Spinner + "Testing..."
   - Success: Checkmark + "Connected (234ms)" with response preview (truncated 100 chars)
   - Error: X icon + error message
4. Use `aria-live="polite"` region to announce results to screen readers
5. Timeout: 10s
6. Write component tests
7. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test`

**Acceptance Criteria**:
- [ ] Component tests pass
- [ ] Loading state announced to screen readers
- [ ] Error messages user-friendly

**References**: spec.md (FR-008, AR-003), contracts/providers.md (error mapping)

---

## Phase 3.4: Integration & Polish

### T030: Wire auto-discovery to app lifecycle
**Status**: ⏳ Pending  
**File**: `apps/desktop/src/main.ts`  
**Dependencies**: T021, T022  
**Parallel**: N/A

**Steps**:
1. Edit `apps/desktop/src/main.ts`
2. On first launch (detect via electron-store flag `firstLaunch: true`):
   - Call `AutoDiscoveryService.discover()` after app ready
   - If profiles created: Log diagnostics event
   - Set `firstLaunch: false` in store
3. Do not block app startup (run discovery in background)
4. Write integration test in `apps/desktop/tests/integration/app-lifecycle.test.ts`
5. Run: `npm --workspace @metaverse-systems/llm-tutor-desktop run test:integration`

**Acceptance Criteria**:
- [ ] Integration test passes
- [ ] Auto-discovery only runs on first launch
- [ ] App startup not blocked

**References**: quickstart.md (Scenario 1), spec.md (FR-001)

---

### T031: Add LLM diagnostics events to logger
**Status**: ⏳ Pending  
**File**: `apps/backend/src/infra/logging/diagnostics-logger.ts`  
**Dependencies**: T019, T020, T021  
**Parallel**: N/A

**Steps**:
1. Edit `apps/backend/src/infra/logging/diagnostics-logger.ts`
2. Add new event types to `DiagnosticsEvent` union:
   - `llm_profile_created`
   - `llm_profile_updated`
   - `llm_profile_deleted`
   - `llm_profile_activated`
   - `llm_test_prompt`
   - `llm_consent_granted`
   - `llm_consent_denied`
   - `llm_encryption_unavailable`
   - `llm_autodiscovery`
3. Implement redaction: Never log `apiKey` field, log only hostname from `endpointUrl`
4. Write unit tests verifying redaction
5. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [ ] Unit tests pass
- [ ] API keys redacted in all events
- [ ] Events match data-model.md definitions

**References**: data-model.md (diagnostics integration), spec.md (DR-001, DR-003)

---

### T032 [P]: Export diagnostics with LLM events
**Status**: ⏳ Pending  
**File**: `apps/desktop/scripts/export-diagnostics.cjs`  
**Dependencies**: T031  
**Parallel**: ✅

**Steps**:
1. Edit `apps/desktop/scripts/export-diagnostics.cjs`
2. Ensure LLM event types exported to JSONL
3. Test export manually: Create profiles, test prompts, export diagnostics
4. Verify JSONL file contains `llm_*` events with redacted API keys
5. Document in quickstart.md validation section

**Acceptance Criteria**:
- [ ] LLM events appear in exported JSONL
- [ ] API keys not present in export
- [ ] Manual validation passed

**References**: quickstart.md (Diagnostics Validation)

---

### T033 [P]: Unit tests for EncryptionService edge cases
**Status**: ⏳ Pending  
**File**: `apps/backend/tests/unit/encryption-edge-cases.spec.ts`  
**Dependencies**: T017  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Test cases:
   - Empty string encryption
   - Very long API key (500 chars)
   - Unicode characters in API key
   - Encryption unavailable on Linux (mock safeStorage.isEncryptionAvailable() → false)
   - Decrypt invalid ciphertext → graceful error
3. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [ ] All edge cases covered
- [ ] No crashes on invalid input

---

### T034 [P]: Unit tests for ProfileService validation
**Status**: ⏳ Pending  
**File**: `apps/backend/tests/unit/profile-validation.spec.ts`  
**Dependencies**: T019  
**Parallel**: ✅

**Steps**:
1. Create test file
2. Test validation rules:
   - Empty name rejected
   - Invalid UUID rejected
   - Invalid URL rejected
   - Azure profile without consent rejected
   - Profile name >100 chars rejected
   - API key >500 chars rejected
3. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:unit`

**Acceptance Criteria**:
- [ ] All validation rules from data-model.md tested
- [ ] >90% coverage for ProfileService

---

### T035 [P]: Performance test for profile CRUD operations
**Status**: ⏳ Pending  
**File**: `apps/backend/tests/performance/profile-crud.perf.test.ts`  
**Dependencies**: T019  
**Parallel**: ✅

**Steps**:
1. Create performance test file
2. Measure operations with 100 profiles in vault:
   - List profiles: <100ms
   - Create profile: <500ms (excluding network I/O)
   - Update profile: <200ms
   - Delete profile: <200ms
3. Assert p95 latency meets performance goals from plan.md
4. Run: `npm --workspace @metaverse-systems/llm-tutor-backend run test:perf`

**Acceptance Criteria**:
- [ ] All operations meet <500ms target
- [ ] Performance goals documented

**References**: plan.md (Performance Goals)

---

### T036 [P]: Accessibility snapshot test
**Status**: ⏳ Pending  
**File**: `apps/frontend/tests/accessibility/llm-snapshot.spec.ts`  
**Dependencies**: T025-T029  
**Parallel**: ✅

**Steps**:
1. Create Playwright test
2. Navigate to Settings → LLM Profiles
3. Open Add Profile form
4. Open consent dialog
5. Run `axe.run()` on each state
6. Save accessibility report to `docs/reports/accessibility/007-llm-profiles.json`
7. Assert 0 violations for WCAG 2.1 AA
8. Run: `npm --workspace @metaverse-systems/llm-tutor-frontend run test:a11y`

**Acceptance Criteria**:
- [ ] Report saved to docs/reports/
- [ ] 0 violations across all UI states
- [ ] Test T014 passes ✅

**References**: spec.md (AR-001 through AR-006), quickstart.md (Accessibility Tests)

---

### T037 [P]: Update developer documentation
**Status**: ⏳ Pending  
**File**: `docs/llm-profiles.md`  
**Dependencies**: T001-T036  
**Parallel**: ✅

**Steps**:
1. Create `docs/llm-profiles.md`
2. Document:
   - Feature overview (LLM profile management)
   - Architecture diagram (Services → IPC → UI)
   - API reference (7 IPC channels with examples)
   - Storage schema (electron-store vault structure)
   - Testing guide (unit/contract/integration/E2E/a11y)
   - Troubleshooting (encryption fallback, auto-discovery)
3. Link from README.md
4. Add diagrams using Mermaid

**Acceptance Criteria**:
- [ ] Documentation complete and reviewed
- [ ] Linked from main README

---

### T038 [P]: Update architecture.md with LLM module
**Status**: ⏳ Pending  
**File**: `docs/architecture.md`  
**Dependencies**: T001-T036  
**Parallel**: ✅

**Steps**:
1. Edit `docs/architecture.md`
2. Add new section: "LLM Profile Management"
3. Document:
   - Module location: `apps/backend/src/services/llm`, `apps/frontend/src/components/LLMProfiles`
   - Data flow: UI → IPC bridge → ProfileService → electron-store vault
   - Encryption flow: ProfileService → EncryptionService → electron-safeStorage
   - Auto-discovery: App lifecycle → AutoDiscoveryService → ProfileService
4. Update system diagram to include LLM module

**Acceptance Criteria**:
- [ ] Architecture updated
- [ ] Diagrams include LLM module

---

### T039: Manual QA using quickstart workflows
**Status**: ⏳ Pending  
**File**: N/A (manual testing)  
**Dependencies**: T001-T038  
**Parallel**: N/A

**Steps**:
1. Follow quickstart.md scenarios 1-5 manually:
   - Scenario 1: Auto-discovery
   - Scenario 2: Manual profile creation
   - Scenario 3: Switching active profiles
   - Scenario 4: Deleting active profile
   - Scenario 5: Encryption fallback (Linux headless)
2. Test on all platforms: macOS, Windows, Linux
3. Record outcomes in `docs/testing-log.md`
4. Take screenshots for each workflow
5. Verify diagnostics export contains all events

**Acceptance Criteria**:
- [ ] All scenarios pass on all platforms
- [ ] Testing log updated
- [ ] Screenshots captured

**References**: quickstart.md (Usage Workflows)

---

### T040: Final validation and release preparation
**Status**: ⏳ Pending  
**File**: `docs/release-notes/007-llm-connection-management.md`  
**Dependencies**: T039  
**Parallel**: N/A

**Steps**:
1. Run all test suites:
   - Unit: `npm run test:unit --workspaces`
   - Contract: `npm run test:contract --workspaces`
   - Integration: `npm run test:integration --workspaces`
   - E2E: `npm run test:e2e --workspaces`
   - Accessibility: `npm run test:a11y --workspaces`
2. Verify test coverage >90% for all services
3. Create release notes in `docs/release-notes/007-llm-connection-management.md`
4. Document:
   - Features delivered (CRUD, auto-discovery, test prompts, encryption)
   - Breaking changes (none)
   - Known issues (if any)
   - Migration guide (none for new feature)
5. Update CHANGELOG.md
6. Tag branch for merge: `007-llm-connection-management-ready`

**Acceptance Criteria**:
- [ ] All tests pass ✅
- [ ] Coverage >90% ✅
- [ ] Release notes complete
- [ ] Branch ready for merge

---

## Dependencies Graph

```
Setup: T001 → T002 → T003

Tests (TDD): T001 → T004, T005, T006, T007, T008, T009, T010 (all parallel)
             T001 → T011, T012, T013 (integration tests, parallel)
             T001 → T014, T015, T016 (E2E/a11y tests, parallel)

Core Implementation:
  T003 → T017 (EncryptionService)
  T017 → T018 (ProfileVault)
  T018 → T019 (ProfileService)
  T019 → T020 (TestPromptService)
  T019 → T021 (AutoDiscoveryService)
  T019, T020, T021 → T022 (IPC Handlers)
  T022 → T023 (IPC Bridge)

UI Layer:
  T023 → T024 (useLLMProfiles hook)
  T024 → T025, T026, T027, T028, T029 (all parallel UI components)

Integration:
  T021, T022 → T030 (App lifecycle)
  T019, T020, T021 → T031 (Diagnostics events)
  T031 → T032 (Export)

Polish:
  T017 → T033
  T019 → T034, T035
  T025-T029 → T036, T037, T038 (all parallel)
  T001-T038 → T039 → T040
```

---

## Parallel Execution Examples

### Phase 3.2 (Tests) - Launch all contract tests together:
```bash
# Terminal 1
npm -F @metaverse-systems/llm-tutor-backend test:contract apps/backend/tests/contract/llm/list-profiles.contract.test.ts

# Terminal 2
npm -F @metaverse-systems/llm-tutor-backend test:contract apps/backend/tests/contract/llm/create-profile.contract.test.ts

# Terminal 3
npm -F @metaverse-systems/llm-tutor-backend test:contract apps/backend/tests/contract/llm/update-profile.contract.test.ts

# ... (continue for T006-T010)
```

### Phase 3.3 (UI Components) - Build components in parallel:
```bash
# Terminal 1: ProfileForm
# Task T026: Build Profile form component

# Terminal 2: ConsentDialog
# Task T027: Build consent dialog component

# Terminal 3: DeleteConfirmDialog
# Task T028: Build delete confirmation dialog

# Terminal 4: TestConnectionButton
# Task T029: Build test connection button
```

---

## Validation Checklist

**GATE: All must be ✅ before marking Phase 3 complete**

- [x] All contracts (7 IPC endpoints) have contract tests (T004-T010)
- [x] All entities (4 domain entities) have model tasks (T001)
- [x] All tests come before implementation (T004-T016 before T017-T029)
- [x] Parallel tasks are truly independent (marked with [P], different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Dependencies documented in graph
- [x] TDD approach enforced (tests fail before implementation)
- [x] Constitutional compliance validated (accessibility, privacy, quality)

---

## Notes

- **[P] tasks** = Different files, no dependencies → Can run in parallel
- **Verify tests fail** before implementing (TDD approach)
- **Commit after each task** for clean Git history
- **Run full test suite** after each phase
- **Update testing-log.md** as you progress
- **Avoid**: Vague tasks, same-file conflicts, skipping tests

---

## Summary

**Total Tasks**: 40  
**Parallel Opportunities**: 20 tasks marked [P]  
**Test-First Tasks**: 13 (T004-T016)  
**Core Implementation**: 13 (T017-T029)  
**Integration & Polish**: 11 (T030-T040)  
**Estimated Completion**: ~3-4 weeks (1 task/day average)

**Key Milestones**:
1. Phase 3.2 complete → All tests failing ✅
2. T019 complete → ProfileService implemented → Contract tests pass ✅
3. T023 complete → IPC bridge ready → Integration tests pass ✅
4. T029 complete → UI components ready → E2E tests pass ✅
5. T040 complete → Feature ready for merge 🚀

**Next Command**: Start with `T001` (Scaffold shared LLM types and Zod schemas)
