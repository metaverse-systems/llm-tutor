# Quickstart: LLM Profile IPC Handlers

**Feature**: 008-llm-profile-ipc  
**For**: Contributors implementing or testing the desktop IPC bridge for LLM profile management  
**Last Updated**: 2025-10-11

---

## Overview

This quickstart walks through:
1. Running the Electron desktop shell with IPC bridge instrumentation
2. Exercising profile CRUD, activation, test, and discovery flows through renderer-to-main IPC
3. Verifying safeStorage outage handling and diagnostics breadcrumbs
4. Executing automated test suites that cover contracts, integration, end-to-end, and accessibility requirements

---

## Prerequisites

- Node.js 20+
- Workspace dependencies installed via `pnpm install`
- Electron desktop dev dependencies available (`pnpm -F @llm-tutor/desktop dev`)
- Optional: Local llama.cpp or mock HTTP endpoint for discovery + test flows

---

## Setup

### 1. Boot the Desktop Shell in Dev Mode
```bash
pnpm -F @llm-tutor/desktop dev
```
- Confirms renderer runs with contextIsolation enabled.
- Opens developer tools for quicker diagnostics review.

### 2. Enable Diagnostics Logging (Optional but Recommended)
```bash
pnpm -F @llm-tutor/desktop run diagnostics:tail
```
- Streams JSONL diagnostics from `app.getPath('userData')/diagnostics/profile-ipc.jsonl`.
- Helps confirm latency measurements and error codes during manual testing.

### 3. (Optional) Start Local llama.cpp Server for Discovery/Test
```bash
./llama-server -m model.gguf --port 8080
```
- Allows the `discover` and `test` channels to exercise real network latency paths.

---

## Usage Workflows

### Scenario 1: Listing Profiles via IPC
1. Launch desktop shell.
2. Open Developer Tools → Console in renderer process.
3. Run `window.api.profile.list()` (new contextBridge helper) and observe resolved promise.
4. Validate response structure `{ success, code: 'OK', data: { profiles: [...] } }`.
5. Confirm diagnostics entry `llmProfile:list` logged with duration < 500 ms.

### Scenario 2: Creating a New Profile
1. In UI, navigate to Settings → LLM Profiles → "Add Profile".
2. Fill form with unique name and remote provider details.
3. Submit and verify:
   - Renderer receives `success: true`, `code: 'OK'`, and sanitized profile summary.
   - Diagnostics breadcrumb includes `channel: "llmProfile:create"` and `safeStorageStatus`.
4. Inspect vault file to ensure no plaintext leakage (when safeStorage available).

### Scenario 3: Handling Validation Errors
1. Attempt to create profile with missing endpoint.
2. Observe renderer toast with accessible message mapped from `VALIDATION_ERROR`.
3. In dev tools, inspect IPC response `userMessage` and `remediation` fields.
4. Confirm diagnostics recorded `durationMs`, `resultCode: 'VALIDATION_ERROR'`.

### Scenario 4: SafeStorage Outage Blocking Writes
1. Simulate outage (Linux example):
   ```bash
   DBUS_SESSION_BUS_ADDRESS=/dev/null pnpm -F @llm-tutor/desktop dev
   ```
2. Attempt profile update from UI.
3. Bridge should respond with `success: false`, `code: 'SAFE_STORAGE_UNAVAILABLE'`.
4. Diagnostics stream shows outage banner; reads (`list`, `test`) remain operational.

### Scenario 5: Testing Prompt Execution Latency
1. From UI, click "Test" on a profile.
2. Measure UI-displayed latency; cross-check diagnostics entry where `durationMs` excludes network time and `totalTimeMs` available via response payload.
3. Ensure truncated response text (≤500 chars) logged in dev tools but not in production diagnostics.

### Scenario 6: Auto-Discovery Flow
1. Start local llama.cpp or mock server on ports 8080/8000/11434.
2. Trigger "Discover" action in UI.
3. Renderer receives array of `DiscoveredProvider` entries with latency metrics.
4. Verify duplicates handled gracefully and errors surface as `DISCOVERY_CONFLICT` where applicable.

### Scenario 7: Dispose Lifecycle
1. Quit the Electron app or reload window.
2. Confirm main process logs `dispose` completion and no `ipcMain.handle` leaks remain (check dev tools or diagnostics tail).

---

## Automated Testing

### 1. Shared Contract Tests
```bash
pnpm -F @metaverse-systems/llm-tutor-shared test -- --runInBand
```
- Validates Zod schemas for request/response envelopes.

### 2. Desktop Contract Tests (Main Process)
```bash
pnpm -F @llm-tutor/desktop test:contract
```
- Executes Vitest suite hitting IPC handlers with mocked services.

### 3. Integration Tests (Desktop + Backend)
```bash
pnpm -F @llm-tutor/desktop test:integration
```
- Spawns electron-main harness and asserts diagnostics/error propagation.

### 4. End-to-End + Accessibility
```bash
pnpm -F @llm-tutor/desktop test:e2e
pnpm -F @llm-tutor/desktop test:axe
```
- Playwright flows ensure renderer UI properly surfaces responses.
- axe-core validates accessibility of error modals and status banners.

### 5. Performance Guardrail
```bash
pnpm -F @llm-tutor/desktop test:performance
```
- Optional harness verifying IPC handlers remain under 500 ms threshold with mocked network latency.

---

## Troubleshooting

- **`SAFE_STORAGE_UNAVAILABLE` persists**: Restart OS keychain (macOS Keychain Access, Windows Credential Manager, or Linux Secret Service daemon) and relaunch app. Diagnostics will mark outage as resolved once available.
- **IPC handler still registered after quit**: Ensure `dispose()` runs in `app.on('will-quit')`; check logs for `profile-ipc.dispose` entry.
- **Latency over 500 ms**: Inspect diagnostics metadata for `serviceDurationMs` to confirm if downstream service is slow; adjust service timeouts accordingly.

---

Happy testing! Reach out in `#llm-desktop` channel if you hit edge cases not covered here.
