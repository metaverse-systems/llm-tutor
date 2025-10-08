# Release Notes – 001 Foundational Workspace & Diagnostics Scaffold

## Overview

Phase 3.7 closes the diagnostics feature slice with hook-level unit coverage, preload IPC tests, comprehensive documentation, and a repeatable validation log. The diagnostics stack now spans backend Fastify routes, Electron IPC, preload bridges, and the renderer hook/UI, with automated export validation riding on a custom Playwright-compatible launcher.

## Highlights

- Added Vitest coverage for `useDiagnostics` (renderer) and `createDiagnosticsBridge` (preload).
- Expanded Playwright configuration to auto-start the preview server, enabling accessibility regressions to run headlessly.
- Introduced an Electron launcher shim (`tests/e2e/tools/electron-launcher.cjs`) so Playwright can exercise the export workflow on Electron 38.
- Authored `docs/diagnostics.md`, detailing runbook procedures, remote LLM opt-in steps, retention enforcement, and troubleshooting commands.
- Logged quickstart execution in `docs/testing-log.md`, including command transcripts and edge cases encountered during dev harness boot.
- Archived a validation summary under `docs/reports/diagnostics/2025-10-07-validation.md` for auditability.

## Test Matrix

| Suite | Status | Notes |
| --- | --- | --- |
| Vitest – Backend | ✅ | Contract + retention integration.
| Vitest – Renderer | ✅ | New hook unit tests green.
| Vitest – Desktop | ✅ | Preload IPC bridge verified.
| Vitest – Shared | ✅ | Diagnostics schema fixtures verified.
| Playwright – Accessibility | ✅ | Headless Chromium via preview webServer.
| Playwright – Electron Export | ✅ | Wrapper executable negotiates a valid remote debugging port before invoking Electron.

## Known Issues

1. **Dev harness port contention** – Running the desktop `dev` script alongside a separate backend watcher leads to `EADDRINUSE`. Consider toggling the backend watcher off when Electron manages the process.
2. **Diagnostics preferences persistence** – Currently cached in-memory; the planned `electron-store` integration remains outstanding (tracked within architecture dependencies).

## Next Steps

- Introduce persistent preference storage via `electron-store` and extend tests accordingly.
- Ship documentation addenda once electron-store lands (update runbook, architecture matrix, and testing log).
- Capture screenshots for the diagnostics runbook once UI polish stabilises.
