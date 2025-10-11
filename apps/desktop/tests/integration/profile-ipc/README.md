# Profile IPC Integration Suite

Integration tests exercise the Electron main process handlers end-to-end with stubbed services to validate diagnostics, timing budgets, and error mapping.

## Harness & Mocks
- Boot the Electron main harness from `tests/tools/main-harness` (or add one) with contextIsolation enabled.
- Inject a controllable `ProfileService` double that records calls, latency, and thrown errors.
- Provide `safeStorage` fakes capable of simulating outages mid-request.
- Mock filesystem access for diagnostics JSONL output so tests can assert rotation without touching the real userData path.
