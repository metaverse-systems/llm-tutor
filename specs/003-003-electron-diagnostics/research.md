# Research: Electron Diagnostics Export Automation

_Last updated: 2025-10-09_

## Research Summary
The export automation must stay reliable across CI and local environments while honoring the programme's accessibility and privacy guarantees. The following decisions consolidate the outcomes of the Phase 0 investigation and guide the completed implementation work. Related operational guidance now lives in `docs/diagnostics.md` (Automation Workflow) and the CI quickstart (`specs/003-003-electron-diagnostics/quickstart.md`).

## Decision Log

### D001 – Remote debugging port allocation
- **Decision**: Allocate a free TCP port at runtime using the launcher helper, with a deterministic retry budget (up to three attempts) before failing hard, and pass the resolved port to Electron via `--remote-debugging-port`.
- **Rationale**: Electron 38 binds the debugging interface before the app window loads; using a dynamically discovered port avoids conflicts with concurrent Chromium-based processes in CI. The bounded retry loop prevents infinite waits while producing actionable error logs for maintainers. This approach satisfies the "Local-First Privacy" principle because the port is bound only to localhost and recycled when the app exits. See `docs/diagnostics.md` for operator-facing steps and env variable overrides (`LLM_TUTOR_REMOTE_DEBUG_PORT`).
- **Alternatives Considered**:
  1. **Static port (e.g., 9222)**  rejected because CI runners frequently reuse the same number, causing flaky launch failures.
  2. **OS-assigned ephemeral port without explicit retries**  rejected because Playwright sometimes races the debugger attachment; explicit retries provide clearer diagnostics and stability.

### D002 – Snapshot readiness polling
- **Decision**: Poll the diagnostics snapshot endpoint with capped exponential backoff (starting at 500dms, doubling until 4ds, max wait 30ds) and log intermediate status messages when the snapshot isn9t ready.
- **Rationale**: The backend emits snapshot files asynchronously; unconditional short polling caused unnecessary load, whereas a capped exponential schedule balances responsiveness and resource usage. Annotated log lines aid triage when the export stalls. This honours the "Quality-Driven TypeScript Web Delivery" gate by providing deterministic, testable behaviour. Playwright helpers (`ensureSnapshotAvailable`) implement the schedule described here.
- **Alternatives Considered**:
  1. **Fixed interval polling (1ds)**  rejected: either too aggressive (wastes IO) or too slow (delays tests) depending on the chosen period.
  2. **WebSocket push notifications**  rejected for scope; extending the backend protocol would delay automation rollout.

### D003 – Export directory policy & log capture
- **Decision**: Persist exports under `app.getPath("userData")/diagnostics/exports` and mirror a JSONL log alongside each run capturing path, timestamp, and outcome; when the directory is missing, create it with `0o700` permissions and warn if the filesystem denies the request.
- **Rationale**: Keeping artifacts inside the existing diagnostics enclave maintains offline privacy expectations and simplifies retention policies already documented in `docs/diagnostics.md`. The co-located JSONL log enables learners and maintainers to audit automation outcomes, aligning with the "Transparent & Controllable AI Operations" gate. The final schema is captured in `packages/shared/src/diagnostics/export-log.ts` and mirrored in `data-model.md`.
- **Alternatives Considered**:
  1. **Using the OS downloads folder**  rejected: exposes learner data to shared locations and complicates cleanup in CI.
  2. **Storing logs separately from exports**  rejected: splits the audit trail and makes troubleshooting harder.

### D004 – Accessibility verification scope
- **Decision**: During the automated export flow, assert keyboard navigation for primary actions, honour high-contrast palette toggles, and disable non-essential animations when `prefers-reduced-motion` is set. Include accessibility state snapshots in the JSONL log.
- **Rationale**: The diagnostics export UI is learner-facing; automation must ensure the flow remains usable for keyboard-only and visually impaired users. Persisting the state snapshot creates a verifiable audit that accessibility gates ran, fulfilling the "Learner-First Accessibility" requirement. Accessibility evidence is surfaced both in the exported JSONL log and the validation report dated 2025-10-09.
- **Alternatives Considered**:
  1. **Limited checks to keyboard navigation only**  rejected: misses regressions affecting low-vision learners.
  2. **Relying on separate accessibility suites**  rejected: duplication risks; integrating checks directly in the export automation keeps coverage representative of real usage.

## Template & Documentation Alignment
- Reviewed `.specify/templates/*` and confirmed no changes are required for this automation feature set. Future templates can reference this research by linking to the quickstart and diagnostics runbook when new diagnostics initiatives are scoped.

## Open Questions
None. All research questions identified in the implementation plan are resolved.
