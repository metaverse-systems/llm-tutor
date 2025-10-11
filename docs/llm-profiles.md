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

All IPC methods return a discriminated union:

```ts
{
  status: "success" | "error";
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

### `llm:profiles:list`
- **Request**: `{}`
- **Success Response**: `{ profiles: LLMProfileSummary[], encryptionAvailable: boolean, activeProfileId: string | null }`
- **Errors**: `VAULT_READ_ERROR`

### `llm:profiles:create`
- **Request**: `{ name, providerType, endpointUrl, apiKey, modelId?, consentTimestamp? }`
- **Success Response**: `{ profile: LLMProfileSummary, warning?: string }`
- **Errors**: `VALIDATION_ERROR`, `VAULT_WRITE_ERROR`

### `llm:profiles:update`
- **Request**: `{ id, updates: Partial<LLMProfileEditableFields> }`
- **Success Response**: `{ profile: LLMProfileSummary, warning?: string }`
- **Errors**: `PROFILE_NOT_FOUND`, `VALIDATION_ERROR`, `VAULT_WRITE_ERROR`

### `llm:profiles:delete`
- **Request**: `{ id, activateAlternateId?: string }`
- **Success Response**: `{ deletedId: string, newActiveProfileId: string | null, requiresUserSelection: boolean }`
- **Errors**: `PROFILE_NOT_FOUND`, `ALTERNATE_NOT_FOUND`, `VAULT_WRITE_ERROR`

### `llm:profiles:activate`
- **Request**: `{ id }`
- **Success Response**: `{ activeProfile: LLMProfileSummary, deactivatedProfileId: string | null }`
- **Errors**: `PROFILE_NOT_FOUND`, `VAULT_WRITE_ERROR`

### `llm:profiles:test`
- **Request**: `{ profileId?: string, promptText?: string }`
- **Success Response**: `TestPromptResult`
- **Errors**: `NO_ACTIVE_PROFILE`, `TIMEOUT`, `ECONNREFUSED`, HTTP status codes as strings

### `llm:profiles:discover`
- **Request**: `{ force?: boolean }`
- **Success Response**: `{ discovered: boolean, url?: string, portScan: PortProbeResult[] }`
- **Errors**: `DISCOVERY_ERROR`

> All type aliases originate from `@metaverse-systems/llm-tutor-shared/llm` and `apps/frontend/src/types/llm-api.ts`.

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

- **Event Stream**: `diagnostics-events.jsonl` includes `llm_profile_created`, `llm_profile_updated`, `llm_profile_deleted`, `llm_profile_activated`, `llm_test_prompt`, `llm_encryption_unavailable`, and `llm_autodiscovery` entries.
- **Sanitisation**: endpoint URLs are reduced to hostnames, API keys are removed, and response text is truncated to 500 characters before logging or export.
- **Exports**: Archive generation merges diagnostics snapshots with LLM events (see `docs/diagnostics.md`).

## Testing Guide

| Layer | Location | Command |
|-------|----------|---------|
| Schemas & Shared Types | `packages/shared/tests/llm/schemas.test.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-shared` |
| Backend Unit | `apps/backend/tests/unit/*.spec.ts` | `npm run test:unit --workspace @metaverse-systems/llm-tutor-backend` |
| Backend Contract | `apps/backend/tests/contract/llm/*.contract.test.ts` | `npm run test:contract --workspace @metaverse-systems/llm-tutor-backend` |
| Backend Integration | `apps/backend/tests/integration/llm/*.test.ts` | `npm run test:integration --workspace @metaverse-systems/llm-tutor-backend` |
| Performance Benchmarks | `apps/backend/tests/performance/profile-crud.perf.test.ts` | `npm run test:perf --workspace @metaverse-systems/llm-tutor-backend` |
| Desktop Main/Preload | `apps/desktop/tests/{main,preload}/**/*.spec.ts` | `npm run test --workspace @metaverse-systems/llm-tutor-desktop` |
| Frontend Hooks & Components | `apps/frontend/tests/{hooks,components,pages}/**/*.test.tsx` | `npm run test --workspace @metaverse-systems/llm-tutor-frontend` |
| Accessibility (Playwright + axe) | `apps/frontend/tests/accessibility/*.spec.ts` | `npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend` |
| Desktop E2E | `apps/desktop/tests/e2e/llm/*.spec.ts` | `npm run test:e2e --workspace @metaverse-systems/llm-tutor-desktop` |

> Contract, integration, E2E, and accessibility suites were authored before implementation (T004–T016) to enforce TDD.

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

## Reference & Further Reading

- `specs/007-llm-connection-management/plan.md`
- `specs/007-llm-connection-management/quickstart.md`
- `docs/diagnostics.md`
- `docs/architecture.md` (LLM module section to be updated in T038)

---

_Last updated: 2025-10-11_
