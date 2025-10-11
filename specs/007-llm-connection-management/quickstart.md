# Quickstart: LLM Connection Management

**Feature**: 007-llm-connection-management  
**For**: Contributors implementing or testing LLM profile functionality  
**Last Updated**: 2025-10-10

---

## Overview

This quickstart guides you through:
1. Setting up a local llama.cpp server for testing
2. Running the LLM profile management UI
3. Testing auto-discovery and profile CRUD operations
4. Validating encryption with electron-safeStorage
5. Running automated tests (unit, contract, integration, E2E, accessibility)

---

## Prerequisites

- Node.js 20+ installed
- pnpm workspace dependencies installed (`pnpm install` from repo root)
- llama.cpp server binary (for testing; see Setup section)
- Electron desktop app built (`pnpm -F @llm-tutor/desktop build` or dev mode)

---

## Setup

### 1. Install llama.cpp (Optional, for Local Testing)

**Download Pre-built Binary**:
```bash
# macOS (Apple Silicon)
curl -L -o llama-server https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-server-macos-arm64
chmod +x llama-server

# Linux (x86_64)
curl -L -o llama-server https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-server-linux-x86_64
chmod +x llama-server
```

**Download a Model**:
```bash
# Small 7B model (~4GB)
curl -L -o model.gguf https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf
```

**Start llama.cpp Server**:
```bash
./llama-server -m model.gguf --port 8080
```

**Verify Health**:
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

---

### 2. Start Development Environment

**Backend (API Server)**:
```bash
pnpm -F @llm-tutor/backend dev
# Runs on http://localhost:3000
```

**Frontend (React UI)**:
```bash
pnpm -F @llm-tutor/frontend dev
# Runs on http://localhost:5173
```

**Desktop (Electron Shell)**:
```bash
pnpm -F @llm-tutor/desktop dev
# Opens Electron window with frontend loaded
```

---

## Usage Workflows

### Scenario 1: First Launch with Auto-Discovery

1. **Start llama.cpp server** on port 8080 (see Setup)
2. **Launch Electron app** for the first time:
   ```bash
   pnpm -F @llm-tutor/desktop dev
   ```
3. **Observe auto-discovery**:
   - App probes ports 8080, 8000, 11434 (2s timeout each)
   - If server detected on 8080, creates default profile:
     - Name: "Local llama.cpp"
     - Endpoint: `http://localhost:8080`
     - Provider: `llama.cpp`
     - Active: `true`
4. **Navigate to Settings → LLM Profiles**:
   - Verify default profile appears in list
   - Click "Test Connection" to send test prompt

---

### Scenario 2: Manual Profile Creation (Azure OpenAI)

1. **Open Settings → LLM Profiles**
2. **Click "Add Profile"**
3. **Fill in form**:
   - Name: `Azure OpenAI Prod`
   - Provider: `Azure OpenAI`
   - Endpoint: `https://my-resource.openai.azure.com/openai/deployments/gpt-4`
   - API Key: `sk-proj-abc123...` (will be encrypted)
   - Model/Deployment: `gpt-4`
4. **Accept consent dialog** (remote provider requires consent)
5. **Click "Save"**
6. **Verify encryption**:
   - If encryption available: See "Encrypted" badge
   - If unavailable: See warning "Stored in plaintext" with link to troubleshooting
7. **Click "Test Connection"**:
   - Observe latency (TTFB) and response text (truncated to 500 chars)
   - Check diagnostics export for `llm_test_prompt` event

---

### Scenario 3: Switching Active Profiles

1. **Create two profiles** (e.g., local llama.cpp + Azure OpenAI)
2. **Verify only one is active** (green "Active" badge)
3. **Click "Activate" on inactive profile**:
   - Previous active profile deactivated atomically
   - New profile marked active
4. **Observe diagnostics**:
   - Export diagnostics (Tools → Export Diagnostics)
   - Verify `llm_profile_activated` event with both old/new profile IDs

---

### Scenario 4: Deleting Active Profile

1. **Create two profiles**, activate Profile A
2. **Click "Delete" on Profile A**
3. **Observe dialog**:
   - "This profile is currently active. Select an alternate profile to activate:"
   - Dropdown with Profile B (and "No Active Profile" option)
4. **Select Profile B**, click "Delete"
5. **Verify**:
   - Profile A deleted
   - Profile B now active
6. **Attempt to delete last remaining profile**:
   - If only one profile exists and active: "No Active Profile" is only option

---

### Scenario 5: Testing Encryption Fallback

**Linux-Only Test** (electron-safeStorage fallback):
1. **Run Electron in headless environment** (no D-Bus Secret Service):
   ```bash
   export DBUS_SESSION_BUS_ADDRESS=/dev/null
   pnpm -F @llm-tutor/desktop dev
   ```
2. **Create profile with API key**
3. **Observe warning**: "Encryption unavailable: API key stored in plaintext"
4. **Check vault file**:
   ```bash
   cat "$(pnpm -F @llm-tutor/desktop node -e 'console.log(require("electron").app.getPath("userData"))')/llm-profiles.json"
   # apiKey field will be plaintext, not encrypted
   ```
5. **Verify diagnostics event**: `llm_encryption_unavailable` logged

---

## Testing Guide

### Unit Tests
**Location**: `packages/shared/tests/llm/`, `apps/backend/tests/contract/llm/`

**Run All**:
```bash
pnpm -F @llm-tutor/shared test
pnpm -F @llm-tutor/backend test:contract
```

**Example Test Cases**:
- `LLMProfileSchema` validates UUID format
- `ProfileVault` enforces "exactly one active" invariant
- `EncryptionService` handles unavailable platform storage gracefully

---

### Contract Tests
**Location**: `apps/backend/tests/contract/llm/`

**Run**:
```bash
pnpm -F @llm-tutor/backend test:contract
```

**Validates**:
- API payloads match Zod schemas
- IPC channels return correct response structures
- Error codes map to documented error types

---

### Integration Tests
**Location**: `apps/backend/tests/integration/llm/`

**Run**:
```bash
pnpm -F @llm-tutor/backend test:integration
```

**Example Test Cases**:
- Create profile → activate → delete workflow
- Test prompt against mock llama.cpp server
- Auto-discovery with multiple ports (mock servers on 8080, 8000, 11434)

**Mock Servers**:
- Use `nock` or `msw` to mock HTTP responses
- Simulate timeouts, 401 errors, 429 rate limits

---

### E2E Tests (Playwright)
**Location**: `apps/desktop/tests/e2e/llm/`

**Run**:
```bash
pnpm -F @llm-tutor/desktop test:e2e
```

**Example Test Cases**:
- Open Settings → LLM Profiles, verify list renders
- Create new profile via UI, verify appears in list
- Test connection button, verify success/error toast
- Delete active profile, verify alternate selection dialog
- Auto-discovery on first launch (reset app state before test)

**Headless Mode**:
```bash
pnpm -F @llm-tutor/desktop test:e2e:headless
```

---

### Accessibility Tests
**Location**: `apps/desktop/tests/a11y/llm-profiles.spec.ts`

**Run**:
```bash
pnpm -F @llm-tutor/desktop test:a11y
```

**Validates**:
- Profile list has proper ARIA labels (`role="list"`, `role="listitem"`)
- Add/Edit profile form inputs have `aria-describedby` for errors
- Delete confirmation dialog has `role="alertdialog"` and proper focus trap
- Test connection button announces results via live region (`aria-live="polite"`)
- Keyboard navigation: Tab through profiles, Enter to activate, Delete key to delete

**Expected Output**:
```
✓ LLM Profiles: Profile list is accessible (0 violations)
✓ LLM Profiles: Add profile form is accessible (0 violations)
✓ LLM Profiles: Delete dialog is accessible (0 violations)
```

---

## Diagnostics Validation

### Export Diagnostics
1. **Run through scenarios** (create, update, activate, delete, test prompt)
2. **Open Tools → Export Diagnostics**
3. **Save snapshot** to `docs/reports/diagnostics/007-llm-profiles-test.jsonl`

### Verify Events
```bash
grep 'llm_' docs/reports/diagnostics/007-llm-profiles-test.jsonl
```

**Expected Event Types**:
```jsonl
{"type":"llm_profile_created","profileId":"...","profileName":"Local llama.cpp","providerType":"llama.cpp","timestamp":1728518400000}
{"type":"llm_profile_activated","profileId":"...","profileName":"Local llama.cpp","providerType":"llama.cpp","timestamp":1728518401000}
{"type":"llm_test_prompt","result":{"success":true,"latencyMs":234,...}}
{"type":"llm_consent_granted","profileId":"...","providerType":"azure","timestamp":1728518500000}
{"type":"llm_profile_deleted","profileId":"...","profileName":"Azure OpenAI Prod","timestamp":1728518600000}
```

**Redaction Check**:
```bash
# Should NOT find any plaintext API keys
grep -i 'sk-proj' docs/reports/diagnostics/007-llm-profiles-test.jsonl
# Expected: No matches
```

---

## Troubleshooting

### Auto-Discovery Fails
**Symptom**: No profiles created on first launch  
**Diagnosis**:
1. Verify llama.cpp server running: `curl http://localhost:8080/health`
2. Check diagnostics for `llm_autodiscovery` event with `discovered: false`
3. Ensure firewall allows localhost connections
4. Try manual profile creation

---

### Encryption Unavailable (Linux)
**Symptom**: "Stored in plaintext" warning on Linux  
**Diagnosis**:
1. Verify D-Bus Secret Service installed:
   ```bash
   ps aux | grep gnome-keyring
   # or
   ps aux | grep ksecretservice
   ```
2. Install keyring manager:
   ```bash
   # GNOME
   sudo apt install gnome-keyring
   # KDE
   sudo apt install kwalletmanager
   ```
3. Restart app after installing keyring

---

### Test Prompt Timeout
**Symptom**: "Request timed out after 10 seconds"  
**Diagnosis**:
1. Check server is responsive: `curl -X POST http://localhost:8080/v1/completions -d '{"prompt":"test"}'`
2. Increase timeout in `TestPromptService` (edit `apps/backend/src/services/llm/test-prompt.service.ts`)
3. Verify model is loaded in llama.cpp server logs

---

### Azure OpenAI 401 Error
**Symptom**: "Invalid API key. Check your credentials."  
**Diagnosis**:
1. Verify API key is correct (check Azure portal)
2. Ensure endpoint URL matches pattern: `https://{resource}.openai.azure.com/openai/deployments/{deployment}`
3. Check Azure subscription has quota for deployment
4. Verify API version is supported (currently `2024-02-15-preview`)

---

## Code Locations

| Component                  | Path                                                   |
|----------------------------|--------------------------------------------------------|
| Profile Service            | `apps/backend/src/services/llm/profile.service.ts`     |
| Encryption Service         | `apps/backend/src/infra/encryption/index.ts`           |
| Test Prompt Service        | `apps/backend/src/services/llm/test-prompt.service.ts` |
| Auto-Discovery Service     | `apps/desktop/src/main/llm/auto-discovery.ts`          |
| IPC Handlers               | `apps/desktop/src/main/llm/ipc-handlers.ts`            |
| IPC Bridge (Preload)       | `apps/desktop/src/preload/llm-bridge.ts`               |
| Settings UI (React)        | `apps/frontend/src/pages/settings/LLMProfiles.tsx`     |
| Zod Schemas                | `packages/shared/src/llm/schemas.ts`                   |
| Unit Tests                 | `packages/shared/tests/llm/`                           |
| Contract Tests             | `apps/backend/tests/contract/llm/`                     |
| Integration Tests          | `apps/backend/tests/integration/llm/`                  |
| E2E Tests                  | `apps/desktop/tests/e2e/llm/`                          |
| Accessibility Tests        | `apps/desktop/tests/a11y/llm-profiles.spec.ts`         |

---

## Next Steps

1. **Implement Data Model**: Create Zod schemas in `packages/shared/src/llm/schemas.ts`
2. **Build Services**: Implement ProfileService, EncryptionService, TestPromptService
3. **Wire IPC Handlers**: Register channels in `apps/desktop/src/main/llm/ipc-handlers.ts`
4. **Build UI Components**: Create Settings page with profile list, add/edit forms, test buttons
5. **Write Tests**: Unit → Contract → Integration → E2E → Accessibility (TDD approach)
6. **Validate Accessibility**: Run `axe-core` scans, verify WCAG 2.1 AA compliance
7. **Export Diagnostics**: Verify the JSONL export appends sanitised `llm_*` entries from `diagnostics-events.jsonl` with API keys redacted

---

## Contributor Checklist

Before submitting PR:
- [ ] All unit tests pass (`pnpm test`)
- [ ] Contract tests validate API schemas
- [ ] Integration tests cover CRUD workflows
- [ ] E2E tests verify UI interactions (Playwright)
- [ ] Accessibility tests report 0 violations (axe-core)
- [ ] Diagnostics events logged correctly (JSONL export contains sanitised `llm_*` entries)
- [ ] API keys redacted in all read operations
- [ ] Encryption fallback tested (Linux headless mode)
- [ ] Auto-discovery tested with/without llama.cpp server
- [ ] Documentation updated (README, architecture.md)

---

## Resources

- **llama.cpp Docs**: https://github.com/ggerganov/llama.cpp
- **Azure OpenAI API**: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
- **electron-store**: https://github.com/sindresorhus/electron-store
- **electron-safeStorage**: https://www.electronjs.org/docs/latest/api/safe-storage
- **Playwright**: https://playwright.dev/
- **axe-core**: https://github.com/dequelabs/axe-core

---

## Summary

This quickstart covers setup (llama.cpp server, dev environment), usage workflows (auto-discovery, manual creation, activation, deletion, encryption fallback), testing guide (unit/contract/integration/E2E/a11y), diagnostics validation, troubleshooting, code locations, and contributor checklist. Follow TDD approach: write tests first, implement features, validate accessibility, export diagnostics.
