# Data Model: Backend LLM Profile Operations

## Entities

### ProfileRecord
- **Identifiers**: `id` (UUID v4, unique)
- **Attributes**: `name`, `providerType`, `endpointUrl`, `apiKey` (stored encrypted/redacted), `modelId`, `consentTimestamp`, `isActive`, `createdAt`, `modifiedAt`
- **Relationships**: None; stored in local electron-store vault as array with single active profile constraint.
- **Validation Rules**:
  - `name` non-empty ≤ 120 chars.
  - `providerType` ∈ {`llama.cpp`, `azure`, `custom`}.
  - `endpointUrl` required for network providers; must be HTTPS except for localhost.
  - `consentTimestamp` required for remote providers.
  - Exactly one profile may have `isActive: true`.

### ProfileListFilter
- **Attributes**: optional `providerTypes[]`, `includeDiagnostics` boolean.
- **Use**: narrows profile listing results.

### DraftProfile
- **Attributes**: `name`, `providerType`, `endpointUrl?`, `apiKey?`, `modelId?`, `consentTimestamp?`.
- **Constraints**: server validates using shared Zod schema; API keys always redacted in responses.

### PromptTestRequest
- **Attributes**: `profileId`, `promptOverride?`, `timeoutMs?` (defaults to 30_000).
- **Behaviour**: uses profile-level credentials; operations aborted when safe storage unavailable.

### PromptTestResult
- **Attributes**: `profileId`, `profileName`, `providerType`, `success`, `latencyMs`, `response?`, `errorCode?`, `diagnostics` (structured metadata), `correlationId`.
- **Constraints**: `latencyMs` includes provider duration; `response` truncated ≤ 500 chars.

### DiscoveryScope
- **Attributes**: `strategy` (`local`|`remote`), `timeoutMs?`, `includeExisting?`.
- **Behavior**: passed to probe service to constrain search.

### DiscoveryResult
- **Attributes**: `providers[]` with `id`, `name`, `providerType`, `endpointUrl`, `status` (`available`|`conflict`|`error`), `notes`.
- **Constraints**: remove duplicates, mark conflicts when endpoint already configured.

### DiagnosticsBreadcrumb
- **Attributes**: `channel`, `requestId`, `correlationId`, `operatorRole`, `durationMs`, `resultCode`, `safeStorageStatus`, `metadata`.
- **Behaviour**: emitted for each handler, persisted to JSONL log.

## State Transitions
- **Profile lifecycle**: create → active/inactive updates → delete (requires successor if active).
- **Safe storage outage**: `available` → `unavailable` blocks writes → `available` retries queued operations.
- **Prompt test**: pending → success/error (timeout, network, auth) with diagnostic emission.

## Data Volume & Scale Assumptions
- Profiles per learner: < 50.
- Prompt tests: on-demand, serial (no high throughput).
- Discovery probes: run intermittently; results cached for quick UI display.
