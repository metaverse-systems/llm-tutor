# Contract: Backend LLM Profile API

## Base
- **Protocol**: HTTP/HTTPS (Fastify)
- **Base Path**: `/api/llm/profiles`
- **Auth**: Local Electron session (same-process); no external tokens required.
- **Headers**: `Content-Type: application/json`; `X-Request-Id` forwarded when available.

## Endpoints

### GET `/`
- **Purpose**: Return all profiles with sanitized fields and diagnostics hints.
- **Query Parameters**:
  - `providerTypes?`: comma-separated list to filter results.
  - `includeDiagnostics?`: boolean flag (`true|false`).
- **Response 200**:
  ```jsonc
  {
    "profiles": [
      {
        "id": "uuid",
        "name": "Local llama.cpp",
        "providerType": "llama.cpp",
        "endpointUrl": "http://localhost:11434",
        "apiKey": "***REDACTED***",
        "modelId": "llama-3-8b",
        "isActive": true,
        "consentTimestamp": null,
        "createdAt": "2025-10-10T18:23:15.123Z",
        "modifiedAt": "2025-10-11T09:05:12.456Z"
      }
    ],
    "diagnostics": [],
    "correlationId": "uuid",
    "durationMs": 120,
    "safeStorageStatus": "available"
  }
  ```
- **Errors**:
  - `500 VAULT_READ_ERROR`
  - `503 SAFE_STORAGE_UNAVAILABLE`

### POST `/`
- **Purpose**: Create a new profile.
- **Request Body**:
  ```jsonc
  {
    "profile": {
      "name": "Azure GPT-4",
      "providerType": "azure",
      "endpointUrl": "https://my-endpoint.azure.com",
      "apiKey": "secret",
      "modelId": "gpt-4o",
      "consentTimestamp": "2025-10-11T09:00:00.000Z"
    },
    "context": {"operatorId": "desktop-user"}
  }
  ```
- **Response 201**:
  ```jsonc
  {
    "profile": { "id": "uuid", "name": "Azure GPT-4", "providerType": "azure", "apiKey": "***REDACTED***", ... },
    "correlationId": "uuid",
    "durationMs": 180,
    "safeStorageStatus": "available"
  }
  ```
- **Errors**:
  - `400 VALIDATION_ERROR`
  - `423 SAFE_STORAGE_UNAVAILABLE`
  - `500 VAULT_WRITE_ERROR`

### PATCH `/:profileId`
- **Purpose**: Apply partial updates.
- **Request Body**: `{ "changes": Partial<DraftProfile> }`
- **Response 200**: Updated sanitized profile payload with diagnostics metadata.
- **Errors**: `404 PROFILE_NOT_FOUND`, `400 VALIDATION_ERROR`, `423 SAFE_STORAGE_UNAVAILABLE`, `500 VAULT_WRITE_ERROR`.

### DELETE `/:profileId`
- **Query/String Body**: `{ "successorProfileId?": "uuid" }`
- **Response 200**: `{ "deletedId": "uuid", "alternateProfileId": "uuid?", "requiresUserSelection": false }`
- **Errors**: `404 PROFILE_NOT_FOUND`, `409 ALTERNATE_NOT_FOUND`, `409 ACTIVE_PROFILE_REQUIRED`, `500 VAULT_WRITE_ERROR`.

### POST `/:profileId/activate`
- **Request Body**: `{ "force?": boolean }`
- **Response 200**: `{ "activeProfile": ProfileSummary, "previousActiveId?": "uuid", "durationMs": number }`
- **Errors**: `404 PROFILE_NOT_FOUND`, `500 VAULT_WRITE_ERROR`.

### POST `/:profileId/test`
- **Request Body**: `{ "promptOverride?": string, "timeoutMs?": number }`
- **Response 200**:
  ```jsonc
  {
    "success": true,
    "latencyMs": 2400,
    "providerType": "llama.cpp",
    "response": "Short answer...",
    "diagnostics": {"networkLatencyMs": 1200},
    "correlationId": "uuid"
  }
  ```
- **Errors**: `404 PROFILE_NOT_FOUND`, `409 NO_ACTIVE_PROFILE`, `504 TIMEOUT`, `502 NETWORK_ERROR`, `401 PROVIDER_UNAUTHORIZED`.

### POST `/discover`
- **Request Body**: `{ "scope": { "strategy": "local", "timeoutMs?": 3000, "includeExisting?": false } }`
- **Response 200**: `{ "providers": [DiscoveryResult], "correlationId": "uuid" }`
- **Errors**: `500 DISCOVERY_ERROR`.

## Diagnostics & Headers
- Every successful or error response includes `correlationId`, `requestId` echo, `durationMs`, and `safeStorageStatus`.
- Handlers emit diagnostics breadcrumbs with identical correlation IDs for traceability.
