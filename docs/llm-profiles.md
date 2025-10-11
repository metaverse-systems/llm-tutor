# LLM Profile Management Developer Guide

The LLM profile management module powers secure model connectivity inside LLM Tutor. It centralises profile storage, encryption, diagnostics, and UI workflows so learners can switch between local and remote providers while preserving privacy guarantees. This guide covers the architecture, IPC contracts, storage schema, testing surface, and troubleshooting workflows introduced in feature plan 007.

## Architecture at a Glance

```mermaid
graph TD
  Renderer[Renderer UI (React)] -->|invoke window.llmAPI| Preload[Preload Bridge (llm-bridge.ts)]
  Preload -->|ipcRenderer.invoke| Main[Electron Main (registerLLMHandlers)]
  Main -->|services| Backend[Backend LLM Services]
  Backend -->|persist| Vault[electron-store Profile Vault]
  Backend -->|emit| Diagnostics[Diagnostics Logger (diagnostics-events.jsonl)]
  Backend -->|http POST| Providers[LLM Providers (llama.cpp / Azure / Custom)]
  Main -->|auto-discovery| Discovery[AutoDiscoveryService]
```

### Key Components

- **Renderer UI** (`apps/frontend/src/pages/settings/LLMProfiles.tsx`): surfaces profile lists, consent dialogs, connection tests, and diagnostics messaging.
- **Preload Bridge** (`apps/desktop/src/preload/llm-bridge.ts`): exposes a typed `window.llmAPI` facade for renderer code.
- **Electron Main Handlers** (`apps/desktop/src/main/llm/ipc-handlers.ts`): validate payloads, orchestrate services, and translate errors into contract responses.
- **Backend Services** (`apps/backend/src/services/llm`): implement encryption, persistence, CRUD, auto-discovery, diagnostics logging, and provider integrations.
- **Diagnostics Pipeline** (`apps/backend/src/infra/logging/diagnostics-logger.ts`, exports in `docs/reports/`): records de-identified operational events alongside snapshots.

## IPC API Reference

All IPC methods in feature 008 use a structured envelope format and return responses with correlation IDs for diagnostics tracing:

```ts
// Request Envelope (feature 008+)
{
  channel: ProfileIpcChannel;
  requestId: string;              // UUID v4
  timestamp: number;              // Epoch ms
  context: OperatorContext;       // { operatorId, operatorRole, locale }
  payload: ProfileOperationRequest;
}

// Response Format
{
  requestId: string;              // Echoed from request
  channel: ProfileIpcChannel;
  success: boolean;
  code: ProfileErrorCode | 'OK';
  data: T | null;
  userMessage: string;            // Accessible copy
  remediation?: string | null;    // Optional next steps
  correlationId: string;          // UUID for diagnostics linkage
  durationMs: number;             // Handler runtime
  safeStorageStatus: 'available' | 'unavailable';
}
```

### `llm:profiles:list` / `llmProfile:list`

- **Legacy Request** (feature 007): `{}`
- **New Request** (feature 008): Envelope with `{ type: 'list', filter?: { providerTypes?, includeDiagnostics? } }`
- **Success Response**: `{ profiles: ProfileSummary[], diagnostics?: DiagnosticHint[] }`
- **Errors**: `VAULT_READ_ERROR`
- **Performance Budget**: 500ms

### `llm:profiles:create` / `llmProfile:create`

- **Legacy Request** (feature 007): `{ name, providerType, endpointUrl, apiKey, modelId?, consentTimestamp? }`
- **New Request** (feature 008): Envelope with `{ type: 'create', profile: DraftProfile }`
- **Success Response**: `{ profile: ProfileSummary }`
- **Errors**: `VALIDATION_ERROR`, `VAULT_WRITE_ERROR`, `SAFE_STORAGE_UNAVAILABLE`

### `llm:profiles:update` / `llmProfile:update`

- **Legacy Request** (feature 007): `{ id, updates: Partial<LLMProfileEditableFields> }`
- **New Request** (feature 008): Envelope with `{ type: 'update', profileId: string, changes: Partial<DraftProfile> }`
- **Success Response**: `{ profile: ProfileSummary }`
- **Errors**: `PROFILE_NOT_FOUND`, `VALIDATION_ERROR`, `VAULT_WRITE_ERROR`, `SAFE_STORAGE_UNAVAILABLE`

### `llm:profiles:delete` / `llmProfile:delete`

- **Legacy Request** (feature 007): `{ id, activateAlternateId?: string }`
- **New Request** (feature 008): Envelope with `{ type: 'delete', profileId: string, successorProfileId?: string }`
- **Success Response**: `{ deletedId: string, requiresUserSelection: boolean, alternateProfileId?: string }`
- **Errors**: `PROFILE_NOT_FOUND`, `ALTERNATE_NOT_FOUND`, `VAULT_WRITE_ERROR`

### `llm:profiles:activate` / `llmProfile:activate`

- **Legacy Request** (feature 007): `{ id }`
- **New Request** (feature 008): Envelope with `{ type: 'activate', profileId: string, force?: boolean }`
- **Success Response**: `{ activeProfile: ProfileSummary, deactivatedProfileId?: string }`
- **Errors**: `PROFILE_NOT_FOUND`, `VAULT_WRITE_ERROR`

### `llm:profiles:test` / `llmProfile:test`

- **Legacy Request** (feature 007): `{ profileId?: string, promptText?: string }`
- **New Request** (feature 008): Envelope with `{ type: 'test', profileId: string, promptOverride?: string, timeoutMs?: number }`
- **Success Response**: `{ profileId, profileName, providerType, success, promptText, response?, errorCode?, latencyMs, diagnostics }`
- **Errors**: `NO_ACTIVE_PROFILE`, `PROFILE_NOT_FOUND`, `TIMEOUT`, `NETWORK_ERROR`

### `llm:profiles:discover` / `llmProfile:discover`

- **Legacy Request** (feature 007): `{ force?: boolean }`
- **New Request** (feature 008): Envelope with `{ type: 'discover', scope: { strategy: 'local'|'remote', timeoutMs?: number, includeExisting?: boolean } }`
- **Success Response**: `{ providers: DiscoveredProvider[] }`
- **Errors**: `DISCOVERY_ERROR`

> **Migration Note**: Feature 007 introduced the `llm:profiles:*` channels. Feature 008 added structured envelopes with `llmProfile:*` channels. Both formats are supported for backward compatibility, but new code should use feature 008 envelopes.

> All type aliases originate from `@metaverse-systems/llm-tutor-shared/contracts/llm-profile-ipc` (feature 008) and `@metaverse-systems/llm-tutor-shared/llm` (feature 007).

## Storage Schema

Profiles persist to `app.getPath("userData")/llm-profiles.json` using `electron-store`. The structure is validated by `ProfileVaultSchema`.

```jsonc
{
  "version": "1.0.0",
  "encryptionAvailable": true,
  "profiles": [
    {
      "id": "3c12c4a0-8d7d-4b9a-9c5a-0c8be31a69df",
      "name": "Local llama.cpp",
      "providerType": "llama.cpp",
      "endpointUrl": "http://localhost:11434",
      "apiKey": "<encrypted ciphertext>",
      "modelId": "llama-3-8b-instruct",
      "isActive": true,
      "consentTimestamp": null,
      "createdAt": "2025-10-10T18:23:15.123Z",
      "modifiedAt": "2025-10-10T18:23:15.123Z"
    }
  ]
}
```

### Invariants

- Exactly one profile may have `isActive: true`.
- Remote providers (`azure`, `custom`) require a non-null `consentTimestamp`.
- API keys remain encrypted when safe storage is available and redacted (`***REDACTED***`) in all responses/logs.

## Diagnostics & Logging

- **Event Stream**: `diagnostics-events.jsonl` includes profile lifecycle events (`llm_profile_created`, `llm_profile_updated`, `llm_profile_deleted`, `llm_profile_activated`), test prompts (`llm_test_prompt`), encryption events (`llm_encryption_unavailable`), auto-discovery (`llm_autodiscovery`), and IPC operations (`llm_profile_ipc`).
- **IPC Breadcrumbs** (feature 008): Every profile IPC operation records a diagnostic breadcrumb containing:
  - `channel`: The IPC channel invoked (e.g., `llmProfile:list`)
  - `requestId`: UUID identifying the request
  - `correlationId`: UUID linking request → service → diagnostics events
  - `operatorRole`: Authenticated operator role for audit trail
  - `durationMs`: Handler execution time (excluding network I/O)
  - `resultCode`: Operation result (`OK`, `VALIDATION_ERROR`, `TIMEOUT`, etc.)
  - `safeStorageStatus`: Encryption availability at operation time
  - `metadata`: Sanitized operation-specific details
- **Sanitisation**: Endpoint URLs reduced to hostnames, API keys removed, response text truncated to 500 characters, and prompt text limited to 500 characters before logging or export.
- **Correlation**: Each IPC response includes a `correlationId` that links to breadcrumb events, enabling full trace analysis from renderer request → main handler → service layer → diagnostics log.
- **Performance Tracking**: Operations exceeding performance budgets (500ms for list) emit `performance-threshold-warning` events. Breadcrumbs always record actual duration for analysis.
- **Exports**: Archive generation merges diagnostics snapshots with LLM events (see `docs/diagnostics.md`). Profile IPC breadcrumbs are automatically included in all exports.

## Testing Guide

| Layer | Location | Command |
|-------|----------|---------|
| Shared Schemas & Contracts | `packages/shared/tests/{llm,contracts}/*.test.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-shared` |
| Profile IPC Contracts | `packages/shared/tests/contracts/llm-profile-ipc.schema.test.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-shared` |
| Backend Unit | `apps/backend/tests/unit/*.spec.ts` | `npm run test:unit --workspace @metaverse-systems/llm-tutor-backend` |
| Backend Contract | `apps/backend/tests/contract/llm/*.contract.test.ts` | `npm run test:contract --workspace @metaverse-systems/llm-tutor-backend` |
| Backend Integration | `apps/backend/tests/integration/llm/*.test.ts` | `npm run test:integration --workspace @metaverse-systems/llm-tutor-backend` |
| Performance Benchmarks | `apps/backend/tests/performance/profile-crud.perf.test.ts` | `npm run test:perf --workspace @metaverse-systems/llm-tutor-backend` |
| Desktop Main/Preload | `apps/desktop/tests/{main,preload}/**/*.spec.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-desktop` |
| Desktop Unit (Safe Storage) | `apps/desktop/tests/unit/safe-storage-outage.service.spec.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-desktop` |
| Desktop Performance (IPC) | `apps/desktop/tests/performance/profile-ipc.performance.spec.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-desktop` |
| Frontend Hooks & Components | `apps/frontend/tests/{hooks,components,pages}/**/*.test.tsx` | `npm run test --workspace @metaverse-systems/llm-tutor-frontend` |
| Accessibility (Playwright + axe) | `apps/frontend/tests/accessibility/*.spec.ts` | `npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend` |
| Desktop E2E | `apps/desktop/tests/e2e/llm/*.spec.ts` | `npm run test:e2e --workspace @metaverse-systems/llm-tutor-desktop` |

> Contract, integration, E2E, and accessibility suites were authored before implementation (T004–T016) to enforce TDD. Feature 008 added comprehensive unit tests for schemas, safe-storage outage management, and performance regression tests for IPC handlers.

## Troubleshooting

### Encryption Fallback

- **Symptom**: Responses include `warning: "Encryption unavailable – API keys stored in plaintext"`.
- **Cause**: `safeStorage.isEncryptionAvailable()` returned `false` (common on Linux headless builds).
- **Resolution**: Install a supported keychain (e.g., `libsecret-1` on Linux) or accept plaintext storage in non-production environments. Diagnostics log `llm_encryption_unavailable` with metadata.

### Auto-Discovery No Results

- Ensure `llama.cpp` exposes a `/health` endpoint on ports `8080`, `8000`, or `11434`.
- Trigger a manual re-scan using `llm:profiles:discover` with `{ force: true }`.
- Review diagnostics log entries for `llm_autodiscovery` to inspect failed port probes.

### Consent Errors

- Remote providers require the consent dialog to supply `consentTimestamp`. Verify the renderer’s `ConsentDialog` completion and ensure profile updates retain the stored timestamp.

### Diagnostics Export Missing LLM Events

- Confirm `LLM_TUTOR_DIAGNOSTICS_DIR` is set when launching the backend during tests.
- Rerun the export after performing at least one profile CRUD action or prompt test; events stream only after services emit activity.

### Safe Storage Unavailable Error

- **Symptom**: IPC operations return `SAFE_STORAGE_UNAVAILABLE` error code, profile writes are blocked.
- **Cause**: Electron's `safeStorage.isEncryptionAvailable()` returned `false`, triggering an outage state.
- **Resolution**: 
  1. Check safe storage availability: The diagnostics manager tracks outage state including `startedAt` timestamp and blocked request IDs.
  2. On Linux: Install keychain dependencies (`libsecret-1-dev` or equivalent).
  3. On Windows/macOS: Verify system keychain is unlocked and accessible.
  4. Check diagnostics breadcrumbs for `safeStorageStatus: "unavailable"` entries.
  5. Once resolved, the system automatically clears the outage state and processes queued operations.

### Performance Degradation

- **Symptom**: Profile list operations take >500ms, performance warnings appear in diagnostics.
- **Diagnosis**:
  1. Export diagnostics and filter for `llm_profile_ipc` events with `resultCode: "TIMEOUT"` or high `durationMs` values.
  2. Check breadcrumbs for patterns (e.g., large profile counts, encryption overhead).
  3. Run performance regression tests: `npm test apps/desktop/tests/performance/profile-ipc.performance.spec.ts`
- **Resolution**:
  1. If due to profile count: Consider implementing pagination (future enhancement).
  2. If due to encryption: Verify safe storage performance or consider encryption opt-out in dev environments.
  3. If persistent: File issue with diagnostics export showing breadcrumbs with correlation IDs.

### Missing Correlation IDs in Diagnostics

- **Symptom**: Breadcrumb events have auto-generated correlation IDs instead of request-linked IDs.
- **Cause**: IPC responses missing correlation ID, triggering auto-generation.
- **Resolution**: This is expected behavior for resilience. All operations generate valid correlation IDs even when propagation fails. Check the `correlationId` field in breadcrumbs to trace operations.

## Reference & Further Reading

- `specs/007-llm-connection-management/plan.md` - Initial LLM profile management feature
- `specs/007-llm-connection-management/quickstart.md` - Quick start guide
- `specs/008-llm-profile-ipc/plan.md` - Structured IPC envelopes and diagnostics integration
- `specs/008-llm-profile-ipc/contracts/api.md` - Complete IPC contract specifications
- `docs/diagnostics.md` - Diagnostics system and performance monitoring
- `docs/architecture.md` - Overall system architecture

---

_Last updated: 2025-10-11 (Feature 008 - Profile IPC Handlers)_
