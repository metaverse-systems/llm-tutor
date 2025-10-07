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
| Backend HTTP Layer | Fastify 4, `@fastify/type-provider-zod` | ⚠️ Pending | Required for diagnostics API slice; add to `apps/backend` dependencies before implementation tasks T012–T014. |
| Backend Storage Helpers | `electron-store` (shared usage) | ⚠️ Pending | Needed to persist accessibility preferences; install under `apps/desktop` and share preload typings. |
| Accessibility Tooling | `@axe-core/playwright`, `axe-html-reporter` | ⚠️ Pending | Supports Phase 3.2 accessibility regression; add to `apps/frontend` devDependencies alongside Playwright config update. |
| Electron Diagnostics | `systeminformation`, `tree-kill` | ⚠️ Review | Evaluate during diagnostics snapshot implementation for cross-platform process stats and safe shutdown. |

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
