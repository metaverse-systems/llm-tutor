# Architecture Overview

LLM Tutor delivers a privacy-first tutoring experience that runs entirely on the learner's
device. The platform pairs a TypeScript/Node.js services layer with a React-based user
interface packaged inside an Electron desktop shell. This document outlines the guiding
runtime architecture and highlights the responsibilities of each tier.

## 1. Runtime Components

| Component | Responsibilities | Key Technologies |
|-----------|-----------------|------------------|
| Electron Main Process | Boots the desktop shell, orchestrates app lifecycle, manages native menus, launches the bundled backend, exposes diagnostic dialogs, and enforces single-instance behavior. | Electron (main), Node.js |
| Backend Services | Provide curriculum generation, tutoring orchestration, assessment storage, and model routing APIs. Run as Node.js processes invoked by the Electron shell; remain reachable via local IPC/HTTP. | Node.js, TypeScript, Express/Fastify (TBD) |
| Renderer UI | Accessible React UI that renders lessons, practice, quizzes, analytics, and settings. Communicates with the backend through secure IPC channels or localhost HTTP. | React, TypeScript, Electron renderer |
| Preload Layer | Bridges IPC calls between renderer and main, whitelisting capabilities, injecting context, and enforcing privacy boundaries. | Electron preload, TypeScript |
| Local LLM Runtime | Hosts inference (default: `llama.cpp`) and vector retrieval stores. Keeps all learner data on-disk locally unless remote providers are toggled on. | llama.cpp, SQLite/PostgreSQL, vector index |

## 2. Dependencies & Tooling Audit

| Area | Tooling | Status | Notes |
|------|---------|--------|-------|
| Workspace Tooling | Node.js 20.x, npm 10.8, TypeScript 5.5, ESLint, Prettier, Vitest, Playwright | ✅ Installed | Verified via `npm install` on 2025-10-07. |
| Backend HTTP Layer | Fastify 4, Zod | ✅ Implemented | Fastify + Zod contracts wired into diagnostics API (`apps/backend`). |
| Backend Storage Helpers | `electron-store` (shared usage) | ⚠️ Planned | Diagnostics ship with in-memory preference cache; electron-store adoption remains on the backlog for persistence parity. |
| Accessibility Tooling | Playwright, axe-core | ⚠️ In Progress | Playwright accessibility flows run in CI; axe-core assertions scheduled for the next polish sprint. |
| Electron Diagnostics | `systeminformation`, `tree-kill` | ⚠️ Deferred | Cross-platform metrics use native Node APIs today; revisit external deps once Windows/Linux parity gaps surface. |

> Update this matrix as tooling is installed during Phase 3 execution.

## 3. High-Level Data Flow

1. **App Launch** – Electron main process starts, registers protocols, verifies local LLM
	 availability, and spawns the backend service process.
2. **Renderer Boot** – Main process loads the React bundle into a BrowserWindow. Preload
	 scripts expose a constrained API surface (e.g., `llm.connect`, `course.generate`).
3. **Curriculum Requests** – Renderer issues IPC/HTTP calls to backend endpoints. Backend
	 composes prompts, consults domain models from `packages/shared`, and requests inference
	 from the local LLM runtime.
4. **Persistence** – Backend writes learner records, quizzes, and embeddings to the local
	 relational database and vector store. No network egress occurs unless the user enables
	 an optional remote backend.
5. **Feedback Loop** – Results return to the renderer, which updates UI state and pushes
	 telemetry to the local audit log for transparency.

## 4. Packaging & Distribution

- **Bundling** – The Electron build step packages the backend (Node.js services), renderer
	assets, preload scripts, and configuration defaults into platform-specific installers.
- **Offline Defaults** – Installers must ship with local LLM configuration templates and
	ensure the first-run experience works without internet access.
- **Updates** – Auto-update hooks may be provided but MUST be disable-able. Update checks
	must clearly disclose any remote endpoints contacted.
- **Diagnostics** – The Electron menu exposes a diagnostics console that summarizes local
	LLM connectivity, database health, and recent AI operations for troubleshooting.

## 5. Privacy & Accessibility Enforcement

- **IPC Security** – Preload layer whitelists renderer capabilities; sensitive operations
	(filesystem, process control) stay confined to the main process.
- **Data Residency** – All prompts, responses, and learner data persist under the user’s
	profile directory. Remote providers require explicit opt-in and provide clear consent
	dialogs from the renderer UI.
- **Accessibility** – The renderer uses the same component library and automated testing
	pipelines as the browser build (axe/Lighthouse). Electron main process exposes system
	shortcuts for high-contrast mode, reduced motion, and screen reader announcements.

## 6. Future Design Considerations

- **Service Modularization** – As curriculum, tutoring, assessment, and analytics mature,
	split backend services into modules with explicit APIs to keep the codebase maintainable.
- **Multi-Window Support** – Consider separate windows for instructor dashboards or admin
	tooling, ensuring shared state is synchronized through the backend rather than renderer
	globals.
- **Remote Provider Abstraction** – Establish a provider interface that keeps remote
	inference endpoints behind feature flags and preserves audit logging semantics.
- **Testing Strategy** – Maintain automated tests covering Electron-specific flows (window
	boot, preload contracts) alongside existing unit, integration, accessibility, and e2e
	suites.

This architecture description will evolve as implementation details solidify. Each major
feature plan should reference the constitution, update this document with concrete
components and diagrams, and note any cross-cutting concerns introduced by Electron.

## 7. Diagnostics Observability

### 7.1 Snapshot Lifecycle

- **Collection** – The backend `snapshot.service` hydrates `DiagnosticsSnapshotPayload` by combining Fastify health checks, llama.cpp probe results, disk usage stats, and persisted accessibility preferences. The service emits structured JSONL entries into the per-user diagnostics directory.
- **Transport** – Fastify exposes `GET /internal/diagnostics/summary` and `POST /internal/diagnostics/refresh`, which Electron’s main process proxies via IPC channels defined in `apps/desktop/src/ipc/diagnostics.ts`.
- **Renderer Sync** – The preload bridge (`createDiagnosticsBridge`) pushes updates into the renderer hook `useDiagnostics`, which debounces polling, merges retention warnings, and normalizes process events.

### 7.2 Export & Retention Flow

- **Retention Guardrails** – `retention.ts` runs on an interval to prune snapshots older than 30 days and raises warnings when JSONL payloads exceed 500 MB. Warnings surface through IPC and render as toast alerts with accessible messaging.
- **Export UX** – Triggering an export from the diagnostics panel invokes Electron’s `exportDiagnosticsSnapshot`, opens a save dialog, writes the JSONL payload, and returns success metadata back through the preload bridge.
- **Testing Hooks** – Contract, integration, accessibility, unit, and Electron smoke suites cover these paths, and reports are archived under `docs/reports/diagnostics/`.

### 7.3 Remote LLM Opt-In Path

1. **Toggle Location** – The renderer surfaces remote-provider opt-in under diagnostics > “LLM Connectivity”. Users must explicitly enable the flag before any network traffic occurs.
2. **Consent Dialog** – Enabling remote providers launches a modal summarizing data handling, tenancy requirements, and the URLs that will be contacted. Users must confirm before preferences persist.
3. **Preference Storage** – Upon confirmation, the selection writes to the diagnostics preference cache (electron-store pending). The backend reloads providers on the next snapshot refresh, ensuring local-first remains the default.
4. **Auditing** – Each opt-in/out event registers as a `ProcessHealthEvent` so the export log captures the decision history for support scenarios.
