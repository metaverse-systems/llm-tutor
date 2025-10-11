# Data Model: LLM Connection Management

**Feature**: 007-llm-connection-management  
**Phase**: 1 (Design & Contracts)  
**Date**: 2025-10-10

## Domain Entities

### 1. LLMProfile
**Purpose**: Represents a single LLM provider connection configuration with authentication credentials and metadata.

**Fields**:
```typescript
interface LLMProfile {
  id: string;                    // UUID v4, immutable, primary key
  name: string;                  // Display name, mutable, duplicates allowed
  providerType: ProviderType;    // Enum: 'llama.cpp' | 'azure' | 'custom'
  endpointUrl: string;           // HTTP(S) URL, validated format
  apiKey: string;                // Encrypted or plaintext (with warning flag)
  modelId: string | null;        // Optional for llama.cpp; required for Azure
  isActive: boolean;             // Exactly one profile must have true
  consentTimestamp: number | null; // Epoch ms; required for remote providers
  createdAt: number;             // Epoch ms, immutable
  modifiedAt: number;            // Epoch ms, updated on save
}
```

**Validation Rules**:
- `id`: Must be valid UUID v4
- `name`: 1-100 characters, non-empty after trim
- `providerType`: Must be one of enum values
- `endpointUrl`: 
  - Must be valid URL (protocol + host)
  - Local providers: Allow `http://localhost` or `http://127.0.0.1`
  - Remote providers: Enforce `https://`, reject `http://` unless user override
  - Validate Azure endpoints match pattern: `*.openai.azure.com`
- `apiKey`: 1-500 characters (accommodate long keys)
- `modelId`: If present, 1-200 characters
- `isActive`: Boolean (default false for new profiles)
- `consentTimestamp`: Required (non-null) if `providerType !== 'llama.cpp'`
- `createdAt`, `modifiedAt`: Positive integers

**State Transitions**:
```
[New] → (save) → [Inactive] → (activate) → [Active]
                              ↓
[Active] → (deactivate) → [Inactive] → (delete) → [Deleted]
   ↑                          ↓
   └───────(activate another)─┘
```

- Only one profile can be `[Active]` at a time
- Deleting `[Active]` profile requires selecting another or confirming "no active profile" state
- Activating a profile automatically deactivates the previous active profile (atomic operation)

**Relationships**:
- One-to-many: User → LLMProfiles (no explicit user entity in MVP; implicit single-user via electron-store)
- One-to-many: LLMProfile → TestPromptResults (captured in diagnostics snapshots, not persisted in profile vault)

---

### 2. ProfileVault
**Purpose**: Container for all profiles with global settings, persisted via electron-store.

**Schema**:
```typescript
interface ProfileVault {
  profiles: LLMProfile[];           // Array of all profiles
  encryptionAvailable: boolean;     // Set on first init; reflects safeStorage status
  version: string;                  // Schema version for future migrations (e.g., "1.0.0")
}
```

**Invariants**:
- Exactly zero or one profile has `isActive: true`
- All profile IDs are unique within `profiles` array
- If any profile has `providerType !== 'llama.cpp'`, it must have `consentTimestamp !== null`

**Persistence**:
- Storage path: `app.getPath('userData')/llm-profiles.json` (electron-store default)
- Atomic writes via electron-store (handles file locking)
- Encrypted fields: `apiKey` encrypted via electron-safeStorage if available; stored as base64-encoded ciphertext

---

### 3. TestPromptResult
**Purpose**: Captures outcome of a test prompt request for diagnostics and UI feedback.

**Fields**:
```typescript
interface TestPromptResult {
  profileId: string;              // UUID of tested profile
  profileName: string;            // Snapshot of name at test time
  providerType: ProviderType;
  success: boolean;               // True if response received
  promptText: string;             // Actual prompt sent (e.g., "Hello, can you respond?")
  responseText: string | null;    // Truncated to 500 chars, null on error
  modelName: string | null;       // Extracted from response metadata, null on error
  latencyMs: number | null;       // Time-to-first-byte (TTFB), null on error
  totalTimeMs: number;            // Total request duration including generation
  errorCode: string | null;       // HTTP status code or error type (e.g., "ECONNREFUSED", "TIMEOUT")
  errorMessage: string | null;    // User-friendly error description
  timestamp: number;              // Epoch ms when test initiated
}
```

**Storage**: Appended to diagnostics snapshots (JSONL format) as events with `type: "llm_test_prompt"`. Not persisted in profile vault.

---

### 4. ConsentRecord
**Purpose**: Audit trail for remote provider consent decisions, embedded in profile or diagnostics.

**Fields**:
```typescript
interface ConsentRecord {
  profileId: string;              // UUID of profile requiring consent
  providerType: ProviderType;     // Must be 'azure' or 'custom'
  consentGranted: boolean;        // True if user accepted
  timestamp: number;              // Epoch ms when consent dialog resolved
  ipAddress: string | null;       // Optional: local IP for audit (privacy consideration)
}
```

**Storage**: Logged to diagnostics snapshots with `type: "llm_consent_granted"` or `"llm_consent_denied"`. Timestamp also stored in `LLMProfile.consentTimestamp` for quick access.

---

## Type Definitions (Zod Schemas)

Location: `packages/shared/src/llm/schemas.ts`

```typescript
import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['llama.cpp', 'azure', 'custom']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const LLMProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  providerType: ProviderTypeSchema,
  endpointUrl: z.string().url(),
  apiKey: z.string().min(1).max(500),
  modelId: z.string().min(1).max(200).nullable(),
  isActive: z.boolean(),
  consentTimestamp: z.number().int().positive().nullable(),
  createdAt: z.number().int().positive(),
  modifiedAt: z.number().int().positive(),
}).refine(
  (data) => data.providerType === 'llama.cpp' || data.consentTimestamp !== null,
  { message: 'Remote providers require consentTimestamp' }
);

export type LLMProfile = z.infer<typeof LLMProfileSchema>;

export const ProfileVaultSchema = z.object({
  profiles: z.array(LLMProfileSchema),
  encryptionAvailable: z.boolean(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
}).refine(
  (data) => data.profiles.filter(p => p.isActive).length <= 1,
  { message: 'At most one profile can be active' }
);

export type ProfileVault = z.infer<typeof ProfileVaultSchema>;

export const TestPromptResultSchema = z.object({
  profileId: z.string().uuid(),
  profileName: z.string(),
  providerType: ProviderTypeSchema,
  success: z.boolean(),
  promptText: z.string(),
  responseText: z.string().max(500).nullable(),
  modelName: z.string().nullable(),
  latencyMs: z.number().int().positive().nullable(),
  totalTimeMs: z.number().int().positive(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  timestamp: z.number().int().positive(),
});

export type TestPromptResult = z.infer<typeof TestPromptResultSchema>;

export const ConsentRecordSchema = z.object({
  profileId: z.string().uuid(),
  providerType: ProviderTypeSchema,
  consentGranted: z.boolean(),
  timestamp: z.number().int().positive(),
  ipAddress: z.string().ip().nullable(),
});

export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;
```

---

## Service Layer Responsibilities

### ProfileService (`apps/backend/src/services/llm/profile.service.ts`)
- CRUD operations on `ProfileVault`
- Enforce "exactly one active" invariant
- Validate profiles against Zod schemas
- Delegate encryption/decryption to EncryptionService

### EncryptionService (`apps/backend/src/infra/encryption/index.ts`)
- Wrap electron-safeStorage API
- Check `isEncryptionAvailable()` and set vault flag
- Encrypt/decrypt API keys, return plaintext with warning flag if unavailable
- Expose diagnostic status for troubleshooting

### TestPromptService (`apps/backend/src/services/llm/test-prompt.service.ts`)
- Execute test prompts against active or specified profile
- Measure TTFB and total latency
- Sanitize responses, truncate to 500 chars
- Map HTTP/network errors to user-friendly messages
- Return `TestPromptResult` for UI rendering and diagnostics logging

### AutoDiscoveryService (`apps/desktop/src/main/llm/auto-discovery.ts`)
- Probe localhost:8080, :8000, :11434 on first launch
- Use `Promise.allSettled()` for parallel probes (2s timeout each)
- Create default profile if any probe succeeds
- Cache results for 5 minutes to avoid repeated scans
- Log discovery attempts to diagnostics

---

## UI State Management

### `useLLMProfiles` Hook (`apps/frontend/src/hooks/useLLMProfiles.ts`)
**Responsibilities**:
- Fetch all profiles via IPC bridge
- Maintain local state for optimistic updates
- Provide CRUD methods: `createProfile()`, `updateProfile()`, `deleteProfile()`, `activateProfile()`
- Handle loading/error states
- Invalidate cache on profile changes

**State Shape**:
```typescript
interface LLMProfilesState {
  profiles: LLMProfile[];
  activeProfile: LLMProfile | null;
  loading: boolean;
  error: string | null;
  encryptionAvailable: boolean;
}
```

---

## Diagnostics Integration

### Event Types
Append to existing diagnostics snapshots (`apps/backend/src/infra/logging/diagnostics-logger.ts`):

```typescript
type DiagnosticsEvent = 
  | { type: 'llm_profile_created'; profileId: string; profileName: string; providerType: ProviderType; timestamp: number }
  | { type: 'llm_profile_updated'; profileId: string; profileName: string; changes: string[]; timestamp: number }
  | { type: 'llm_profile_deleted'; profileId: string; profileName: string; timestamp: number }
  | { type: 'llm_profile_activated'; profileId: string; profileName: string; providerType: ProviderType; timestamp: number }
  | { type: 'llm_test_prompt'; result: TestPromptResult }
  | { type: 'llm_consent_granted'; profileId: string; providerType: ProviderType; timestamp: number }
  | { type: 'llm_consent_denied'; profileId: string; providerType: ProviderType; timestamp: number };
```

**Redaction Rules**:
- Never log `apiKey` field (plaintext or encrypted)
- Log only hostname from `endpointUrl` (strip path/query params)
- Truncate `responseText` in test prompt results to 500 chars

---

## Migration & Versioning

**Current Version**: `1.0.0`

**Future Considerations**:
- If schema changes (e.g., adding `deploymentName` for Azure), increment version and write migration logic
- On vault load, check `version` field and run migrations sequentially
- Preserve backward compatibility where possible (add optional fields with defaults)

---

## Summary

Four primary entities: **LLMProfile** (connection config), **ProfileVault** (container), **TestPromptResult** (diagnostics), **ConsentRecord** (audit). Profiles identified by UUID, allowing duplicate display names. Exactly one active profile enforced via service layer. Encryption handled by separate service with graceful degradation. All operations logged to diagnostics with API key redaction. Zod schemas provide runtime validation across workspaces.
