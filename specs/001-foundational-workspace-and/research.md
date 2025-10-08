# Phase 0 Research – Foundational Workspace & Diagnostics Scaffold

## Decision Log

### Diagnostics API transport
- **Decision**: Use Fastify 4.x with TypeScript typings for the backend diagnostics endpoints.
- **Rationale**: Fastify offers lightweight request handling, JSON schema validation, and first-class TypeScript support, which keeps the diagnostics surface small and performant (<1s requirement) while leaving room to expand later.
- **Alternatives considered**:
  - **Express**: Familiar but slower to add schema validation and requires more manual typing.
  - **NestJS**: Too heavy for the minimal bootstrap slice and would increase cold-start time.

### Snapshot persistence & rotation
- **Decision**: Persist snapshots as newline-delimited JSON files under `app.getPath("userData")/diagnostics/snapshots.jsonl`, rotating once file size exceeds 500 MB and pruning entries older than 30 days.
- **Rationale**: Keeps everything local (constitutional requirement), allows simple append + streaming exports, and aligns with the 30-day/500 MB policy without introducing an RDBMS yet.
- **Alternatives considered**:
  - **SQLite**: Adds migration overhead before domain models require relational queries.
  - **Plain log file without rotation**: Risks uncontrolled disk usage and violates FR-006 warning expectations.

### Accessibility preference storage
- **Decision**: Store `AccessibilityPreference` values via `electron-store` (JSON-backed) keyed per OS user profile.
- **Rationale**: Provides atomic reads/writes from both preload and main without manual file-locking and honours Electron best practices.
- **Alternatives considered**:
  - **Custom JSON file via `fs`**: Requires manual locking logic and validation.
  - **Browser `localStorage`**: Renderer-only, would not synchronise with the desktop shell.

### LLM connectivity check strategy
- **Decision**: Implement a pluggable adapter that pings the configured local llama.cpp HTTP endpoint (host/port from config) and reports `connected | unreachable | disabled` without retry storms.
- **Rationale**: Satisfies FR-002 transparency while honouring Local-First privacy. Keeps remote adapters out of scope but defines an interface for later.
- **Alternatives considered**:
  - **Continuous polling**: Increased CPU usage with little value before we have sustained traffic.
  - **No check**: Leaves maintainers guessing about local runtime status, violating diagnostics requirements.

### Desktop error handling & exports
- **Decision**: Surface backend failures via Electron `dialog.showMessageBox` and allow exporting the most recent snapshot as a JSON file through `dialog.showSaveDialog`.
- **Rationale**: Matches spec acceptance criteria (non-technical messaging) and uses trusted OS dialogs without bundling additional UI libraries.
- **Alternatives considered**:
  - **Custom renderer modal**: Duplicates UI work already required in the desktop shell.
  - **Silent logging only**: Hides critical failures from learners/maintainers.
