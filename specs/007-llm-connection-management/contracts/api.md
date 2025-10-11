# API Contracts: LLM Connection Management

**Feature**: 007-llm-connection-management  
**Phase**: 1 (Design & Contracts)  
**Date**: 2025-10-10

## Overview

Internal IPC API contracts for managing LLM profiles in the Electron desktop environment. All endpoints use JSON request/response bodies with Zod schema validation. Error responses follow standardized format.

**Base Path**: `/internal/llm`  
**Protocol**: Electron IPC (not HTTP REST in MVP; REST endpoints reserved for future web client)

---

## Common Types

### ErrorResponse
```typescript
{
  error: string;           // Machine-readable error code (e.g., "VALIDATION_ERROR")
  message: string;         // Human-readable error description
  details?: unknown;       // Optional validation errors or stack trace (dev mode only)
  timestamp: number;       // Epoch ms when error occurred
}
```

### SuccessResponse<T>
```typescript
{
  success: true;
  data: T;
  timestamp: number;
}
```

---

## Endpoints

### 1. List All Profiles
**Channel**: `llm:profiles:list`  
**Method**: Request/Response  
**Description**: Retrieve all LLM profiles with encryption status.

**Request**:
```typescript
{} // No parameters
```

**Response**:
```typescript
SuccessResponse<{
  profiles: LLMProfile[];
  encryptionAvailable: boolean;
  activeProfileId: string | null;
}>
```

**Example Success**:
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Local llama.cpp",
        "providerType": "llama.cpp",
        "endpointUrl": "http://localhost:8080",
        "apiKey": "***REDACTED***",
        "modelId": null,
        "isActive": true,
        "consentTimestamp": null,
        "createdAt": 1728518400000,
        "modifiedAt": 1728518400000
      }
    ],
    "encryptionAvailable": true,
    "activeProfileId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "timestamp": 1728518450000
}
```

**Error Codes**:
- `VAULT_READ_ERROR`: Failed to read profile vault from disk

---

### 2. Create Profile
**Channel**: `llm:profiles:create`  
**Method**: Request/Response  
**Description**: Create a new profile with validation and encryption.

**Request**:
```typescript
{
  name: string;
  providerType: ProviderType;
  endpointUrl: string;
  apiKey: string;
  modelId: string | null;
  consentTimestamp: number | null; // Required for Azure/custom providers
}
```

**Response**:
```typescript
SuccessResponse<{
  profile: LLMProfile;
  warning?: string; // Present if encryption unavailable and storing plaintext
}>
```

**Example Success**:
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Azure OpenAI Prod",
      "providerType": "azure",
      "endpointUrl": "https://my-resource.openai.azure.com",
      "apiKey": "***REDACTED***",
      "modelId": "gpt-4",
      "isActive": false,
      "consentTimestamp": 1728518500000,
      "createdAt": 1728518500000,
      "modifiedAt": 1728518500000
    },
    "warning": "Encryption unavailable: API key stored in plaintext"
  },
  "timestamp": 1728518500000
}
```

**Error Codes**:
- `VALIDATION_ERROR`: Invalid input (e.g., missing consent for Azure)
- `DUPLICATE_NAME_WARNING`: Name already exists (not fatal; profile created)
- `VAULT_WRITE_ERROR`: Failed to persist profile

---

### 3. Update Profile
**Channel**: `llm:profiles:update`  
**Method**: Request/Response  
**Description**: Update an existing profile (partial updates supported).

**Request**:
```typescript
{
  id: string; // UUID of profile to update
  name?: string;
  providerType?: ProviderType;
  endpointUrl?: string;
  apiKey?: string;
  modelId?: string | null;
  consentTimestamp?: number | null;
}
```

**Response**:
```typescript
SuccessResponse<{
  profile: LLMProfile;
  warning?: string;
}>
```

**Error Codes**:
- `PROFILE_NOT_FOUND`: No profile with given ID
- `VALIDATION_ERROR`: Invalid update payload
- `VAULT_WRITE_ERROR`: Failed to persist changes

---

### 4. Delete Profile
**Channel**: `llm:profiles:delete`  
**Method**: Request/Response  
**Description**: Delete a profile with active profile handling.

**Request**:
```typescript
{
  id: string; // UUID of profile to delete
  activateAlternateId?: string; // Optional: UUID of profile to activate if deleting active profile
}
```

**Response**:
```typescript
SuccessResponse<{
  deletedId: string;
  newActiveProfileId: string | null; // Non-null if alternate was activated
  requiresUserSelection: boolean; // True if active profile deleted without alternate
}>
```

**Example Success (Deleting Active Profile)**:
```json
{
  "success": true,
  "data": {
    "deletedId": "550e8400-e29b-41d4-a716-446655440000",
    "newActiveProfileId": null,
    "requiresUserSelection": true
  },
  "timestamp": 1728518600000
}
```

**Error Codes**:
- `PROFILE_NOT_FOUND`: No profile with given ID
- `ALTERNATE_NOT_FOUND`: Specified `activateAlternateId` doesn't exist
- `VAULT_WRITE_ERROR`: Failed to persist deletion

---

### 5. Activate Profile
**Channel**: `llm:profiles:activate`  
**Method**: Request/Response  
**Description**: Set a profile as active (atomic deactivation of previous active).

**Request**:
```typescript
{
  id: string; // UUID of profile to activate
}
```

**Response**:
```typescript
SuccessResponse<{
  activeProfile: LLMProfile;
  deactivatedProfileId: string | null; // UUID of previously active profile, if any
}>
```

**Example Success**:
```json
{
  "success": true,
  "data": {
    "activeProfile": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Azure OpenAI Prod",
      "providerType": "azure",
      "endpointUrl": "https://my-resource.openai.azure.com",
      "apiKey": "***REDACTED***",
      "modelId": "gpt-4",
      "isActive": true,
      "consentTimestamp": 1728518500000,
      "createdAt": 1728518500000,
      "modifiedAt": 1728518700000
    },
    "deactivatedProfileId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "timestamp": 1728518700000
}
```

**Error Codes**:
- `PROFILE_NOT_FOUND`: No profile with given ID
- `VAULT_WRITE_ERROR`: Failed to persist activation

---

### 6. Test Prompt
**Channel**: `llm:profiles:test`  
**Method**: Request/Response  
**Description**: Execute a test prompt against a profile to validate connectivity.

**Request**:
```typescript
{
  profileId?: string; // Optional: UUID of profile to test (defaults to active profile)
  promptText?: string; // Optional: Custom prompt (defaults to "Hello, can you respond?")
}
```

**Response**:
```typescript
SuccessResponse<TestPromptResult>
```

**Example Success**:
```json
{
  "success": true,
  "data": {
    "profileId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "profileName": "Azure OpenAI Prod",
    "providerType": "azure",
    "success": true,
    "promptText": "Hello, can you respond?",
    "responseText": "Hello! Yes, I can respond. How can I assist you today?",
    "modelName": "gpt-4",
    "latencyMs": 234,
    "totalTimeMs": 1567,
    "errorCode": null,
    "errorMessage": null,
    "timestamp": 1728518800000
  },
  "timestamp": 1728518801567
}
```

**Example Failure**:
```json
{
  "success": true,
  "data": {
    "profileId": "550e8400-e29b-41d4-a716-446655440000",
    "profileName": "Local llama.cpp",
    "providerType": "llama.cpp",
    "success": false,
    "promptText": "Hello, can you respond?",
    "responseText": null,
    "modelName": null,
    "latencyMs": null,
    "totalTimeMs": 2015,
    "errorCode": "ECONNREFUSED",
    "errorMessage": "Unable to connect to http://localhost:8080. Is the server running?",
    "timestamp": 1728518900000
  },
  "timestamp": 1728518902015
}
```

**Error Codes**:
- `NO_ACTIVE_PROFILE`: No profile specified and no active profile set
- `PROFILE_NOT_FOUND`: Specified `profileId` doesn't exist
- `TIMEOUT`: Request exceeded 10s limit
- `ECONNREFUSED`, `ENOTFOUND`, etc.: Network errors (returned in `TestPromptResult.errorCode`)

---

### 7. Auto-Discover Profiles
**Channel**: `llm:profiles:discover`  
**Method**: Request/Response  
**Description**: Probe common localhost ports for llama.cpp servers and create default profile.

**Request**:
```typescript
{
  force?: boolean; // Optional: Bypass 5-minute cache and re-run discovery
}
```

**Response**:
```typescript
SuccessResponse<{
  discovered: boolean;
  discoveredUrl: string | null; // URL of discovered server (e.g., "http://localhost:8080")
  profileCreated: boolean; // True if a default profile was created
  profileId: string | null; // UUID of created profile, if any
  probedPorts: number[]; // List of ports checked (e.g., [8080, 8000, 11434])
}>
```

**Example Success (Server Found)**:
```json
{
  "success": true,
  "data": {
    "discovered": true,
    "discoveredUrl": "http://localhost:8080",
    "profileCreated": true,
    "profileId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
    "probedPorts": [8080, 8000, 11434]
  },
  "timestamp": 1728519000000
}
```

**Example Success (No Server Found)**:
```json
{
  "success": true,
  "data": {
    "discovered": false,
    "discoveredUrl": null,
    "profileCreated": false,
    "profileId": null,
    "probedPorts": [8080, 8000, 11434]
  },
  "timestamp": 1728519100000
}
```

**Error Codes**:
- `DISCOVERY_ERROR`: Fatal error during probing (e.g., network stack failure)

---

## IPC Bridge Implementation

### Renderer → Main (apps/desktop/src/preload/llm-bridge.ts)
```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { LLMProfile, TestPromptResult } from '@llm-tutor/shared/llm/schemas';

export const llmAPI = {
  listProfiles: () => ipcRenderer.invoke('llm:profiles:list'),
  createProfile: (payload: CreateProfilePayload) => ipcRenderer.invoke('llm:profiles:create', payload),
  updateProfile: (payload: UpdateProfilePayload) => ipcRenderer.invoke('llm:profiles:update', payload),
  deleteProfile: (payload: DeleteProfilePayload) => ipcRenderer.invoke('llm:profiles:delete', payload),
  activateProfile: (payload: ActivateProfilePayload) => ipcRenderer.invoke('llm:profiles:activate', payload),
  testPrompt: (payload: TestPromptPayload) => ipcRenderer.invoke('llm:profiles:test', payload),
  discoverProfiles: (payload: DiscoverProfilesPayload) => ipcRenderer.invoke('llm:profiles:discover', payload),
};

contextBridge.exposeInMainWorld('llmAPI', llmAPI);
```

### Main Process Handler (apps/desktop/src/main/llm/ipc-handlers.ts)
```typescript
import { ipcMain } from 'electron';
import { ProfileService } from '@backend/services/llm/profile.service';
import { TestPromptService } from '@backend/services/llm/test-prompt.service';
import { AutoDiscoveryService } from './auto-discovery';

export function registerLLMHandlers() {
  ipcMain.handle('llm:profiles:list', async () => {
    try {
      const vault = await ProfileService.loadVault();
      const activeProfile = vault.profiles.find(p => p.isActive) ?? null;
      return {
        success: true,
        data: {
          profiles: vault.profiles.map(p => ({ ...p, apiKey: '***REDACTED***' })),
          encryptionAvailable: vault.encryptionAvailable,
          activeProfileId: activeProfile?.id ?? null,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return formatError('VAULT_READ_ERROR', error);
    }
  });

  // ... (Implement remaining handlers following same pattern)
}

function formatError(code: string, error: unknown) {
  return {
    error: code,
    message: error instanceof Error ? error.message : 'Unknown error',
    details: process.env.NODE_ENV === 'development' ? error : undefined,
    timestamp: Date.now(),
  };
}
```

---

## Validation Rules

All payloads validated using Zod schemas from `packages/shared/src/llm/schemas.ts`:
- Reject requests with invalid UUID formats
- Enforce consent timestamp for Azure/custom providers
- Validate URL formats and enforce HTTPS for remote providers (with user override)
- Truncate response text to 500 characters in `TestPromptResult`
- Enforce 1-100 character limits on profile names
- Reject API keys longer than 500 characters

---

## Security Considerations

1. **API Key Redaction**: Never return plaintext `apiKey` in list/read responses (replace with `"***REDACTED***"`)
2. **Encryption Failures**: Log warning events to diagnostics when storing plaintext keys
3. **HTTPS Enforcement**: Reject `http://` URLs for Azure/custom providers unless user explicitly overrides
4. **Rate Limiting**: Consider adding rate limits on test prompt requests (future enhancement)
5. **Input Sanitization**: Validate all string inputs to prevent injection attacks (Zod handles basic validation)

---

## Summary

Seven IPC channels for CRUD operations, activation, testing, and auto-discovery. All responses follow standardized `SuccessResponse` or `ErrorResponse` formats. API keys redacted in read operations. Test prompts return detailed `TestPromptResult` with latency metrics and error mapping. Auto-discovery probes three ports (8080, 8000, 11434) with 2s timeouts and creates default profile if successful.
