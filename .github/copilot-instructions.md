# llm-tutor Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-07

## Active Technologies
- (001-foundational-workspace-and)
- TypeScript 5.5 (workspaces), Node.js 20 (backend/Electron), React 18 (renderer). + Fastify 4, React 18 + Vite 5, Electron 38, electron-store, Zod, Vitest, Playwright + axe-core. (001-foundational-workspace-and)
- Local filesystem (`app.getPath("userData")/diagnostics`) storing JSONL snapshots + lifecycle events; no external DB. (001-foundational-workspace-and)
- TypeScript 5.5 across Electron backend/renderer, Node.js 20 runtime + Electron 38, React 18 + Vite 5, Fastify 4, electron-store 9, Zod, Vitest, Playwright + axe-core (002-persist-diagnostics-accessibility)
- Local filesystem only — `electron-store` JSON vault for preferences, diagnostics JSONL exports in `app.getPath("userData")/diagnostics` (002-persist-diagnostics-accessibility)
- TypeScript 5.5 across Electron desktop + Playwright harness, Node.js 20 runtime + Electron 38, Playwright, Vite preview server, Vitest, axe-core (003-003-electron-diagnostics)
- Local filesystem only (diagnostics JSONL exports, preference vault) (003-003-electron-diagnostics)
- TypeScript 5.5 (all workspaces), Node.js 20 runtime + Prettier formatter, workspace-specific build tooling (Vite, Fastify, Electron) (004-add-css-formatting)
- N/A (tooling configuration only) (004-add-css-formatting)
- TypeScript 5.5 across workspaces, Node.js 20 runtime for Electron main + backend + Electron 38, electron-store 9, Fastify 4, React 18, Vite 5, Zod (validation), Vitest, Playwright + axe-core (007-llm-connection-management)
- electron-store JSON vault for profiles (API keys encrypted via electron-safeStorage when available); diagnostics JSONL exports unchanged (007-llm-connection-management)
- TypeScript 5.5 across Electron main/renderer and Node.js 20 services + Electron 38 IPC layer, electron-store vault, Zod schema validation, Vitest, Playwright, axe-core (008-llm-profile-ipc)
- Local electron-store JSON vault plus diagnostics JSONL in `app.getPath('userData')/diagnostics` (008-llm-profile-ipc)
- TypeScript 5.5 on Node.js 20 (backend workspace) + Fastify 4, Zod, electron-store (via profile vault), axios/fetch for provider probes (009-implement-backend-llm)
- Local electron-store JSON vault for LLM profiles plus diagnostics JSONL writer (009-implement-backend-llm)

## Workspace Package Management
- Use `npm` for all workspace commands (no `pnpm`).

## Package Naming
- Shared workspace package: `@metaverse-systems/llm-tutor-shared`.

## Project Structure
```
backend/
frontend/
tests/
```

## Commands
# Add commands for 

## Code Style
: Follow standard conventions

## Recent Changes
- 009-implement-backend-llm: Added TypeScript 5.5 on Node.js 20 (backend workspace) + Fastify 4, Zod, electron-store (via profile vault), axios/fetch for provider probes
- 008-llm-profile-ipc: Added TypeScript 5.5 across Electron main/renderer and Node.js 20 services + Electron 38 IPC layer, electron-store vault, Zod schema validation, Vitest, Playwright, axe-core
- 007-llm-connection-management: Added TypeScript 5.5 across workspaces, Node.js 20 runtime for Electron main + backend + Electron 38, electron-store 9, Fastify 4, React 18, Vite 5, Zod (validation), Vitest, Playwright + axe-core

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
