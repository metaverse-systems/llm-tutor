# IPC Contract: `llmProfile:test`

## Request Envelope (unchanged)
```ts
interface LlmProfileTestRequestEnvelope {
  channel: 'llmProfile:test';
  requestId: string;          // UUID v4
  timestamp: number;          // epoch ms
  context: OperatorContext;   // { operatorId, operatorRole, locale }
  payload: {
    type: 'test';
    profileId: string;
    promptOverride?: string;
    timeoutMs?: number;       // default 30000
  };
}
```

## Response Payload (updated)
```ts
interface LlmProfileTestResponse {
  requestId: string;
  channel: 'llmProfile:test';
  success: boolean;
  code: 'OK' | ProfileErrorCode;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: 'available' | 'unavailable';
  data: TestTranscriptPayload | null;
  userMessage: string;
  remediation?: string | null;
}

interface TestTranscriptPayload {
  profileId: string;
  profileName: string;
  providerType: 'llama.cpp' | 'azure' | 'custom';
  status: 'success' | 'error' | 'timeout';
  latencyMs: number;
  errorCode?: ProfileErrorCode;
  remediation?: string;
  history: TranscriptMessage[]; // ordered newest → oldest, length 1..3
}

interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;               // truncated to 500 chars, sanitized
  truncated: boolean;         // true if original text exceeded limit
}
```

## Behavioral Notes
- `history` array contains only the latest three exchanges; older entries are dropped before the renderer sees them.
- When `success === false`, `data` MUST be `null`, and UI falls back to error messaging.
- Diagnostics events include `historyDepth` (1..3) and `messagePreview` (≤120 chars) instead of full transcript bodies.
- Safe storage outages continue to short-circuit writes and may return `SAFE_STORAGE_UNAVAILABLE`; in that case no transcript is stored.
