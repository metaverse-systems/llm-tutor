# Contract: LLM Profile IPC Channels

**Feature**: 008-llm-profile-ipc  
**Phase**: 1 (Design & Contracts)  
**Date**: 2025-10-11

All channels are invoked via `ipcMain.handle(channel, handler)` in the Electron main process. Renderer calls must flow through the contextBridge facade (`window.api.profile.*`). Every response follows the structured envelope defined below.

## Common Envelope

```typescript
interface ProfileIpcRequestEnvelope<TPayload> {
  channel: ProfileIpcChannel;           // see channel list below
  requestId: string;                    // UUID v4
  timestamp: number;                    // epoch ms
  context: OperatorContext;
  payload: TPayload;
}

interface ProfileIpcResponseEnvelope<TData> {
  requestId: string;
  channel: ProfileIpcChannel;
  success: boolean;
  code: ProfileErrorCode | 'OK';
  data: TData | null;
  userMessage: string;
  remediation?: string | null;
  debug?: DebugDetails | null;          // null in production
  correlationId: string;
  durationMs: number;
  safeStorageStatus: 'available' | 'unavailable';
}
```

- `OperatorContext`: `{ operatorId: UUID, operatorRole: 'instructional_technologist' | 'curriculum_lead' | 'support_engineer', locale: BCP47 }`
- `DebugDetails`: `{ message: string; stack?: string } | null` (suppressed when `app.isPackaged === true`)

## Error Codes

| Code | Description | Renderer Handling |
|------|-------------|-------------------|
| OK | Success | Render payload |
| PROFILE_NOT_FOUND | Profile ID not present | Show inline error, suggest refresh |
| VALIDATION_ERROR | Input failed schema validation | Highlight invalid fields |
| CONFLICT_ACTIVE_PROFILE | Attempted activation conflicts with existing active profile | Show choice dialog |
| SAFE_STORAGE_UNAVAILABLE | Encryption unavailable; write blocked | Show warning banner, provide remediation |
| SERVICE_FAILURE | Downstream service error (Profile/Test/Discovery) | Display toast, log diagnostics |
| DISCOVERY_CONFLICT | Auto-discovery detected duplicate/corrupt provider entries | Display review list |
| VAULT_READ_ERROR | Vault load failed | Prompt to retry or restore backup |
| RATE_LIMITED | Remote provider throttled request | Suggest wait and retry |
| TIMEOUT | Operation exceeded configured timeout | Offer retry option |

## Channels

### 1. `llmProfile:list`

**Request Payload**:
```typescript
interface ListProfilesPayload {
  filter?: {
    providerTypes?: ProviderType[];
    includeDiagnostics?: boolean;
  };
}
```

**Response Payload**:
```typescript
interface ListProfilesResponse {
  profiles: ProfileSummary[];
  diagnostics?: ProfileDiagnosticsSummary[];
}
```

**Notes**:
- `includeDiagnostics` adds last error data per profile for accessible status badges.
- Handler must complete within 150 ms (read-only in-memory + disk cached).

---

### 2. `llmProfile:create`

**Request Payload**:
```typescript
interface CreateProfilePayload {
  profile: DraftProfile;
}
```

**Response Payload**:
```typescript
interface CreateProfileResponse {
  profile: ProfileSummary;
}
```

**Notes**:
- Validates DraftProfile schema.
- If safeStorage unavailable → return `SAFE_STORAGE_UNAVAILABLE`.
- Diagnostics include `blocked: boolean` when write prevented.

---

### 3. `llmProfile:update`

**Request Payload**:
```typescript
interface UpdateProfilePayload {
  profileId: string;              // UUID
  changes: Partial<DraftProfile>; // At least one field required
}
```

**Response Payload**:
```typescript
interface UpdateProfileResponse {
  profile: ProfileSummary;
}
```

**Notes**:
- Reject empty `changes` with `VALIDATION_ERROR`.
- Propagate `PROFILE_NOT_FOUND` if ID missing.

---

### 4. `llmProfile:delete`

**Request Payload**:
```typescript
interface DeleteProfilePayload {
  profileId: string;
  successorProfileId?: string | null;  // optional replacement when deleting active profile
}
```

**Response Payload**:
```typescript
interface DeleteProfileResponse {
  deletedId: string;
  successorProfileId: string | null;
}
```

**Notes**:
- Handler enforces single active profile constraint; if no successor provided, returns `CONFLICT_ACTIVE_PROFILE`.

---

### 5. `llmProfile:activate`

**Request Payload**:
```typescript
interface ActivateProfilePayload {
  profileId: string;
  force?: boolean;                   // true allows overriding pending activation
}
```

**Response Payload**:
```typescript
interface ActivateProfileResponse {
  activeProfile: ProfileSummary;
  previousProfileId: string | null;
}
```

**Notes**:
- If attempting to activate already active profile, return success with unchanged data.
- If another activation in-flight, return `CONFLICT_ACTIVE_PROFILE` unless `force` true.

---

### 6. `llmProfile:test`

**Request Payload**:
```typescript
interface TestProfilePayload {
  profileId: string;
  promptOverride?: string;
  timeoutMs?: number; // 1000-10000, default 10000
}
```

**Response Payload**:
```typescript
interface TestProfileResponse {
  profileId: string;
  success: boolean;
  latencyMs: number | null;
  totalTimeMs: number;
  modelName?: string | null;
  truncatedResponse?: string | null;
}
```

**Notes**:
- Handler measures main-process overhead separately and attaches to `durationMs`.
- On downstream failure, return `SERVICE_FAILURE` with remediation guidance.
- Prompt text never logged in production diagnostics.

---

### 7. `llmProfile:discover`

**Request Payload**:
```typescript
interface DiscoverProfilesPayload {
  scope: {
    strategy: 'local' | 'remote';
    timeoutMs: number;              // 500-3000 ms per probe
    includeExisting?: boolean;      // include currently known profiles
  };
}
```

**Response Payload**:
```typescript
interface DiscoverProfilesResponse {
  providers: DiscoveredProvider[];
}
```

**Notes**:
- Duplicate endpoints must be deduplicated; return `DISCOVERY_CONFLICT` when conflicting metadata detected.
- Handler should run probes in parallel with cancellation tokens.

---

## Contract Test Expectations

- Each channel has a corresponding Vitest suite in `apps/desktop/tests/contract/profile-ipc/`.
- Tests assert both success and failure shapes, ensuring `debug` is stripped in production mode mocks.
- Schema imports reference `@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc.ts`.

---

## Diagnostics Schema

Diagnostics events created by handlers MUST satisfy:
```typescript
interface ProfileIpcDiagnosticEvent {
  type: 'profile-ipc';
  channel: ProfileIpcChannel;
  requestId: string;
  correlationId: string;
  operatorRole: OperatorRole;
  durationMs: number;
  serviceDurationMs?: number;
  resultCode: ProfileErrorCode | 'OK';
  safeStorageStatus: 'available' | 'unavailable';
  timestamp: number;
}
```
- Stored in JSONL with max file size 5 MB before rotation.
- Events flagged with `durationMs >= 450` trigger warning severity for monitoring dashboards.
