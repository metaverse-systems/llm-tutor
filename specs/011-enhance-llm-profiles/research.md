# Research Notes: LLM Profile Test Transcript

## Decision 1: Transcript History Limit
- **Decision**: Retain a rolling history of up to three prompt/response exchanges per profile test panel.
- **Rationale**: Three exchanges provide immediate context across retries without overwhelming the learner or bloating the renderer. This keeps DOM size small enough to preserve smooth keyboard navigation and meets the spec requirement to trim older interactions automatically.
- **Alternatives Considered**:
  - **Single exchange only**: Simplified state but prevented learners from comparing quick successive retries.
  - **Full session log**: Risked unbounded growth, memory churn, and made privacy redaction harder.

## Decision 2: Message Payload Schema
- **Decision**: Extend `llmProfile:test` IPC response and `/api/llm/profiles/:profileId/test` HTTP endpoint to return `messages: TranscriptMessage[]` with `{ role: 'user' | 'assistant', text: string, truncated: boolean }` plus latency/status fields.
- **Rationale**: Structured message list maps cleanly to accessibility semantics (role-based rendering) and clarifies truncation state for diagnostics. Including `truncated` flags ensures both renderer and logging paths respect the 500-character limit.
- **Alternatives Considered**:
  - **Single concatenated string**: Harder to style by role and to redact selectively.
  - **Binary flag only on response**: Failed to flag when prompts exceed limits.

## Decision 3: Accessibility & Diagnostics Handling
- **Decision**: Announce transcript availability via `aria-live="polite"`, restore keyboard focus after test completion, and emit diagnostics breadcrumbs with redacted message previews capped at 500 characters.
- **Rationale**: Aligns with constitution accessibility mandate while sustaining existing diagnostics pipeline. Using polite announcements avoids interrupting ongoing keyboard navigation and respects reduced motion preferences.
- **Alternatives Considered**:
  - **Assertive live region**: Risked overwhelming screen reader users with repeated updates.
  - **No diagnostics preview**: Reduced observability for support without clear privacy gain.
