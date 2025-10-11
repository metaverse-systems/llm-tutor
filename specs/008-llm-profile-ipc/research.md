# Research: LLM Profile IPC Handlers

**Feature**: 008-llm-profile-ipc  
**Phase**: 0 (Outline & Research)  
**Date**: 2025-10-11

## Research Questions

### 1. Secure Electron IPC Bridge Practices
**Question**: What security controls must the Electron IPC bridge enforce to keep renderer-to-main messaging safe for profile management?

**Decision**:
- Restrict channels to a fixed allow-list (`llmProfile:list`, `:create`, `:update`, `:delete`, `:activate`, `:test`, `:discover`).
- Register handlers only after verifying `app.isReady()` and contextIsolation status.
- Validate every payload with Zod schemas hosted in `@metaverse-systems/llm-tutor-shared` before invoking services.
- Ensure responses always include a `success` flag, `code`, optional `data`, and redacted `details` in production builds.

**Rationale**: Aligns with Electron security guidelines—deny arbitrary channel registration, never trust renderer input, and return structured data to avoid prototype pollution. Centralized schema validation keeps contracts synchronized across main/renderer.

**Alternatives Considered**:
- Dynamic channel registration per feature: Rejected—harder to audit, increases attack surface.
- JSON-schema validation in renderer only: Rejected—main process must guard against malformed payloads.

**References**: Electron Security Checklist §7, `contextBridge` recommendations.

---

### 2. Measuring Sub-500 ms Handler Performance
**Question**: How do we measure and enforce the <500 ms (excluding network I/O) performance target for IPC handlers?

**Decision**:
- Capture high-resolution timestamps using `performance.now()` at handler entry/exit.
- For network operations (Test/Discover), subtract measured outbound service duration to focus on bridge overhead.
- Emit diagnostics events with `durationMs`, `channel`, `result`, and `safeStorageStatus` for each invocation.
- Trigger warning diagnostics when `durationMs` exceeds 450 ms to catch regressions early.

**Rationale**: Using `performance.now()` inside the main process avoids clock skew. Diagnostics thresholds provide proactive alerts before breaching contractual SLA.

**Alternatives Considered**:
- Rely on renderer timing: Rejected—renderer includes serialization + transport overhead, less precise.
- Skip diagnostics for successful calls: Rejected—hides latency trends and degrades observability principle.

**References**: Node.js `perf_hooks` docs, internal diagnostics conventions from Feature 003.

---

### 3. SafeStorage Outage Strategy
**Question**: What is the recommended process when `safeStorage.isEncryptionAvailable()` is false while operators attempt profile writes?

**Decision**:
- Immediately return error code `SAFE_STORAGE_UNAVAILABLE` to renderer with remediation steps.
- Block create/update/delete/activate operations, allowing read/list/test/discover to continue.
- Schedule retry tickets via diagnostics queue and prompt operators to restore keychain access.
- Persist a transient flag in diagnostics vault noting outage duration and first occurrence timestamp.

**Rationale**: Prevents plaintext secrets from hitting disk (per clarification answer). Keeping read-only operations available preserves continuity, while diagnostics provide auditability.

**Alternatives Considered**:
- Prompt for manual passphrase storage: Rejected—violates clarified requirement to block writes, adds inconsistent UX.
- Transparent plaintext storage: Rejected—conflicts with privacy safeguards and falls outside clarified policy.

**References**: Electron `safeStorage` API, prior Feature 007 decisions.

---

### 4. Error Code Taxonomy & Accessibility Messaging
**Question**: How should we map service errors into structured IPC responses that comply with accessibility and transparency requirements?

**Decision**:
- Standardize codes: `PROFILE_NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT_ACTIVE_PROFILE`, `SAFE_STORAGE_UNAVAILABLE`, `SERVICE_FAILURE`, `DISCOVERY_CONFLICT`, `VAULT_READ_ERROR`, `RATE_LIMITED`, `TIMEOUT`.
- Each response includes `code`, `title`, `userMessage`, optional `remediation`, and `debug` (null in production, populated under `process.env.NODE_ENV !== 'production'`).
- Provide localization keys in addition to human-readable English text so renderer can internationalize copy.
- Log correlation IDs to diagnostics for traceability without exposing raw prompts or secrets.

**Rationale**: Consistent taxonomy eases renderer handling, ensures screen-readers receive concise, actionable text, and meets transparent AI operations principle.

**Alternatives Considered**:
- HTTP-like numeric codes: Rejected—less descriptive for desktop operators.
- Embedding raw service stack traces: Rejected—security risk, violates debug suppression requirement.

**References**: Internal diagnostics schema, WCAG success criterion 3.3.1 (error identification).

---

### 5. Type-Sharing Between Main and Renderer
**Question**: How do we share IPC request/response types across Electron processes without duplicating definitions?

**Decision**:
- Extend `@metaverse-systems/llm-tutor-shared` package with `llmProfileIpc` schema module exporting Zod types and TypeScript interfaces.
- Import these schemas in renderer preload for `contextBridge` wrappers and in main handlers for validation.
- Generate contract tests that import the same schemas to guard against drift.

**Rationale**: Shared package already hosts cross-process schemas; extending it keeps consistency and simplifies contract testing.

**Alternatives Considered**:
- Define types in `apps/desktop` only: Rejected—renderer and backend would risk divergence.
- Use proto/JSON schema: Deferred—Zod already in stack, lower overhead.

**References**: Existing shared schemas for connection management (Feature 007).

---

## Research Summary

All critical unknowns are resolved:
1. ✅ IPC bridge security controls defined with schema validation and channel allow-list.
2. ✅ Latency measurement plan ensures <500 ms budget and proactive diagnostics.
3. ✅ SafeStorage outage protocol blocks writes and preserves read/test operations.
4. ✅ Structured error taxonomy aligns with accessibility and diagnostics requirements.
5. ✅ Shared schema distribution plan leverages existing `@metaverse-systems/llm-tutor-shared` package.

Ready to proceed to Phase 1 (Design & Contracts).

## References
- Electron Security Checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Node `perf_hooks`: https://nodejs.org/api/perf_hooks.html
- Electron safeStorage API: https://www.electronjs.org/docs/latest/api/safe-storage
- WCAG 2.1 Error Identification: https://www.w3.org/TR/WCAG21/#error-identification
``