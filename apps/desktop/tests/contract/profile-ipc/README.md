# Profile IPC Contract Suite

Contract tests validate the shared request/response envelopes exported from `@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc` before they are wired into the Electron bridge.

## Harness & Mocks
- Spin up the lightweight IPC harness from `tests/tools/ipc-harness` with a mocked `ipcMain` channel registry.
- Stub `ProfileService`, `TestPromptService`, and `AutoDiscoveryService` to return deterministic payloads for each channel.
- Provide a safe-storage shim capable of toggling outage states without touching the real OS keychain.
- Capture diagnostics writes into an in-memory sink to assert breadcrumb structure without writing to disk.
