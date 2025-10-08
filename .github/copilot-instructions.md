# llm-tutor Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-07

## Active Technologies
- (001-foundational-workspace-and)
- TypeScript 5.5 (workspaces), Node.js 20 (backend/Electron), React 18 (renderer). + Fastify 4, React 18 + Vite 5, Electron 38, electron-store, Zod, Vitest, Playwright + axe-core. (001-foundational-workspace-and)
- Local filesystem (`app.getPath("userData")/diagnostics`) storing JSONL snapshots + lifecycle events; no external DB. (001-foundational-workspace-and)
- TypeScript 5.5 across Electron backend/renderer, Node.js 20 runtime + Electron 38, React 18 + Vite 5, Fastify 4, electron-store 9, Zod, Vitest, Playwright + axe-core (002-persist-diagnostics-accessibility)
- Local filesystem only — `electron-store` JSON vault for preferences, diagnostics JSONL exports in `app.getPath("userData")/diagnostics` (002-persist-diagnostics-accessibility)

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
- 002-persist-diagnostics-accessibility: Added TypeScript 5.5 across Electron backend/renderer, Node.js 20 runtime + Electron 38, React 18 + Vite 5, Fastify 4, electron-store 9, Zod, Vitest, Playwright + axe-core
- 001-foundational-workspace-and: Added TypeScript 5.5 (workspaces), Node.js 20 (backend/Electron), React 18 (renderer). + Fastify 4, React 18 + Vite 5, Electron 38, electron-store, Zod, Vitest, Playwright + axe-core.
- 001-foundational-workspace-and: Added

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
