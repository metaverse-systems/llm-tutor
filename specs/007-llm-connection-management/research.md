# Research: LLM Connection Management

**Feature**: 007-llm-connection-management  
**Phase**: 0 (Outline & Research)  
**Date**: 2025-10-10

## Research Questions

### 1. llama.cpp API Contract & Auto-Discovery
**Question**: What are the standard llama.cpp REST API endpoints, request/response formats, and common port configurations for auto-discovery?

**Decision**: 
- **Primary endpoint**: `/v1/completions` (OpenAI-compatible)
- **Fallback**: `/completion` (llama.cpp native)
- **Common ports**: 8080 (default llama.cpp server), 8000 (alternative), 11434 (Ollama)
- **Auto-discovery**: Probe all three ports with `HEAD` or `GET /health` requests (timeout 2s per probe)
- **Model info**: `/v1/models` returns available models

**Rationale**: llama.cpp server exposes OpenAI-compatible API for broad compatibility. Ollama (port 11434) is a popular wrapper worth including in auto-discovery. Using `HEAD` requests minimizes bandwidth during probing.

**Alternatives Considered**:
- mDNS/Bonjour discovery: Rejected—adds complexity, not all setups broadcast
- Single port scan: Rejected—users may run llama.cpp on non-default ports
- Blocking probes: Rejected—parallel probes with short timeouts avoid UI freezes

**Implementation Notes**:
- Use `Promise.allSettled()` for parallel probe requests
- Cache successful discovery results for 5 minutes to avoid repeated probes
- Surface discovered model names in UI after successful connection

---

### 2. Azure OpenAI API Integration & Error Handling
**Question**: What are the Azure OpenAI REST API conventions, authentication methods, and error response patterns?

**Decision**:
- **Endpoint pattern**: `https://<resource-name>.openai.azure.com/openai/deployments/<deployment-name>/completions?api-version=2023-05-15`
- **Authentication**: `api-key` header (not Bearer token for Azure)
- **Required fields**: Resource name, deployment name, API key, model ID
- **Error codes**: 401 (invalid key), 404 (deployment not found), 429 (rate limit), 503 (service unavailable)

**Rationale**: Azure OpenAI uses a different endpoint structure than OpenAI's main API. The api-version parameter is mandatory and frequently changes, so make it configurable in profile settings.

**Alternatives Considered**:
- Microsoft Entra ID (OAuth): Deferred—adds auth complexity for MVP; stick with API keys
- Unified OpenAI SDK: Rejected—Azure fork is required for correct routing; use fetch directly

**Implementation Notes**:
- Validate endpoint URLs match `*.openai.azure.com` pattern to prevent SSRF
- Enforce HTTPS for all remote providers (reject HTTP with warning dialog)
- Map Azure error codes to user-friendly messages (e.g., 429 → "Rate limit exceeded; try again in a few minutes")

---

### 3. electron-safeStorage & Cross-Platform Keychain Integration
**Question**: How does `electron-safeStorage` work, and what are the fallback behaviors when platform keychains are unavailable?

**Decision**:
- **macOS**: Uses Keychain (secure, persistent)
- **Windows**: Uses Credential Vault (secure, persistent)
- **Linux**: Uses Secret Service API (`libsecret`); requires `gnome-keyring` or `kwallet` daemon running
- **Fallback**: `safeStorage.isEncryptionAvailable()` returns `false` when keychain unavailable; store plaintext with user consent

**Rationale**: `electron-safeStorage` provides platform-native encryption without custom crypto. Linux environments (especially headless servers or minimal WMs) may lack keyring daemons, requiring graceful degradation per clarification decision A (store unencrypted with warning).

**Alternatives Considered**:
- Custom AES encryption: Rejected—key storage problem remains; no advantage over plaintext if key is in same vault
- Require keyring setup: Rejected—blocks Linux users unnecessarily per clarification
- Prompt for passphrase on each launch: Rejected—poor UX for MVP

**Implementation Notes**:
- Check `safeStorage.isEncryptionAvailable()` in Electron main process before profile creation
- Display modal warning on first remote provider save if encryption unavailable: "Your system keychain is not available. API keys will be stored unencrypted. Continue? [Cancel] [Accept Risk]"
- Log encryption status to diagnostics snapshot for troubleshooting
- Document keyring setup instructions for common Linux distros in `docs/llm-setup.md`

---

### 4. Profile Vault Schema & Concurrency Handling
**Question**: What schema should electron-store use for profile persistence, and how do we handle concurrent modifications (e.g., multiple Electron windows)?

**Decision**:
- **Schema**:
  ```typescript
  {
    profiles: Array<{
      id: string;              // UUID v4
      name: string;            // Display name (duplicates allowed)
      providerType: 'llama.cpp' | 'azure' | 'custom';
      endpointUrl: string;
      apiKey: string;          // Encrypted or plaintext + warning flag
      modelId: string | null;  // Optional for llama.cpp
      isActive: boolean;       // Exactly one true at a time
      consentTimestamp: number | null;  // Epoch ms for remote providers
      createdAt: number;       // Epoch ms
      modifiedAt: number;      // Epoch ms
    }>;
    encryptionAvailable: boolean;  // Set once on first vault init
  }
  ```
- **Concurrency**: electron-store handles file-level locking; rely on Electron's single-instance behavior (already enforced per Feature 001) to prevent multi-window conflicts. If future versions support multi-window, add file-watch listeners and merge strategies.

**Rationale**: UUID-based identity allows duplicate names per clarification. `isActive` flag simplifies queries (no need to scan for "most recent"). Storing `encryptionAvailable` in vault helps diagnose keychain issues in diagnostics exports.

**Alternatives Considered**:
- SQLite for profiles: Rejected—overkill for <100 profiles expected; electron-store JSON is adequate
- Separate encryption metadata: Rejected—complicates reads; embed flag in profile or global setting

**Implementation Notes**:
- Validate exactly one `isActive: true` on vault load; fix inconsistencies automatically
- Use Zod schemas to validate vault structure on read, with migration logic for future schema versions
- Expose `validateVaultIntegrity()` diagnostic function for troubleshooting

---

### 5. Test Prompt Design & Latency Measurement
**Question**: What prompt text should we use for connection tests, and how do we measure accurate latency?

**Decision**:
- **Default prompt**: `"Hello, can you respond with a short message?"` (configurable in settings)
- **Latency measurement**: Start timer before HTTP request, stop after first byte received (TTFB) for primary metric; also capture total request time
- **Response handling**: Truncate to 500 chars, sanitize HTML/script tags before rendering, show model name + latency in UI
- **Timeout**: 10 seconds per NFR-001; surface "Request timed out" error if exceeded

**Rationale**: Generic prompt avoids domain-specific assumptions. TTFB measures model responsiveness; total time includes generation. Truncation prevents UI overflow from verbose models.

**Alternatives Considered**:
- Empty prompt: Rejected—some models error on empty input
- Domain-specific prompt ("Explain photosynthesis"): Rejected—assumes educational context; keep generic
- Streaming test: Deferred—adds complexity; basic request/response sufficient for MVP

**Implementation Notes**:
- Store test prompt text in electron-store preferences (separate from profiles) for easy customization
- Log full test prompt + response (truncated) to diagnostics snapshot for debugging
- Consider adding "Advanced" settings panel with timeout + prompt customization in future iteration

---

## Research Summary

All technical unknowns resolved:

1. ✅ llama.cpp API contract defined; auto-discovery strategy with three common ports
2. ✅ Azure OpenAI endpoint patterns and error codes mapped
3. ✅ electron-safeStorage behavior understood; Linux fallback with consent implemented
4. ✅ Profile vault schema designed with concurrency notes
5. ✅ Test prompt design and latency metrics specified

No blocking ambiguities remain. Ready to proceed to Phase 1 (Design & Contracts).

## References
- llama.cpp server docs: https://github.com/ggerganov/llama.cpp/tree/master/examples/server
- Azure OpenAI REST API: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- electron-store: https://github.com/sindresorhus/electron-store
