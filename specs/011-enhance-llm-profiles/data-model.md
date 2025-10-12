# Data Model: LLM Profile Test Transcript

## Entities

### LLMProfile
- **id**: UUID (existing)
- **name**: string
- **providerType**: enum (`llama.cpp`, `azure`, `custom`, future expansion)
- **isActive**: boolean (only one true)
- **consentTimestamp**: number | null (required for remote providers)
- **lastTestedAt**: ISO timestamp | null (updated when transcript generated)
- **latestTranscriptId**: UUID | null (reference to `TestTranscript`)

### TestTranscript
- **id**: UUID
- **profileId**: UUID (FK → LLMProfile)
- **messages**: `TranscriptMessage[1..3]`
- **status**: enum (`success`, `error`, `timeout`)
- **latencyMs**: number (>=0, <= timeout window)
- **errorCode**: string | null (matches shared contract error codes)
- **remediation**: string | null (human-readable guidance)
- **createdAt**: ISO timestamp
- **clearedAt**: ISO timestamp | null (when transcript removed)

### TranscriptMessage
- **role**: enum (`user`, `assistant`)
- **text**: string (<=500 characters after truncation)
- **truncated**: boolean (true when original input exceeded limit)

### DiagnosticsBreadcrumb (extension)
- **correlationId**: UUID
- **channel**: string (`llmProfile:test` / HTTP path)
- **safeStorageStatus**: `'available' | 'unavailable'`
- **messagePreview**: string (<=120 characters, sanitized)
- **historyDepth**: number (1..3)

## Relationships & Rules
- `LLMProfile (1) ---- (0..1) TestTranscript`: Each profile links to the most recent transcript; transcripts are replaced on subsequent tests beyond three exchanges.
- `TestTranscript.messages` preserves chronological order; array length never exceeds three.
- When a new test completes, prepend the fresh `TranscriptMessage` pairs and drop older entries beyond index 2.
- Clearing the settings view sets `latestTranscriptId` to null and writes `clearedAt` on the transcript for auditing.
- Diagnostics breadcrumbs store redacted previews only; no raw API keys or full prompts.

## State Transitions
1. **Test Requested**: profile selected → pending transcript (no change yet).
2. **Test Succeeded**: backend emits success payload → transcript created/updated, status `success`, latency recorded, messages appended (max three kept).
3. **Test Failed**: backend emits error payload → transcript entry removed, status `error`, `errorCode` & `remediation` surfaced to UI, `messages` cleared.
4. **View Cleared**: learner closes profile view or selects another profile → transcript reference nulled, `clearedAt` set.
5. **Profile Deleted**: cascade delete transcript to avoid orphan records.
