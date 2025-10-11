# Profile IPC End-to-End Suite

E2E specs run through the renderer UI with Playwright to verify the profile management flows over the contextBridge client.

## Harness & Mocks
- Launch the packaged desktop app using the Playwright Electron launcher with the renderer pointed at the Vite dev server.
- Seed fixture profiles inside the local vault before each test to stabilise list/create/update assertions.
- Provide a controllable discovery/test prompt backend (mock HTTP server or llama.cpp stub) so latency assertions are consistent.
- Hook into diagnostics tailing helpers to capture breadcrumb output for assertion from the test runner.
