# Contracts – Settings Page Accessible from Global Header

## Overview
No brand-new HTTP endpoints or IPC channels are required for this feature. The Settings page reuses existing shared contracts for LLM profile management and diagnostics exports while extending the preload and renderer typings to surface navigation helpers and telemetry preference updates.

## Reused Contracts
- `llmProfile:*` IPC envelopes defined in `@metaverse-systems/llm-tutor-shared/contracts/llm-profile-ipc`. These continue to power the embedded LLM Profiles section.
- Diagnostics export IPC (`diagnostics:export`) and HTTP endpoints already provide the necessary functionality for the Diagnostics section links.

## Planned Additions
- **Preload Typings**: Augment `apps/desktop/src/preload/llm-bridge.ts` (or adjacent preload entry) with a `settings` namespace exposing:
  - `navigateToSettings(): Promise<void>` (used by the header gear icon)
  - `telemetry.getState(): Promise<{ enabled: boolean; consentTimestamp?: number }>`
  - `telemetry.setState(update: { enabled: boolean }): Promise<void>` that respects opt-out default and records consent timestamps when enabling
- **Renderer Types**: Extend the shared `@metaverse-systems/llm-tutor-shared` package with a `TelemetryPreference` type to avoid duplicating shape across frontend and desktop workspaces.

## Contract Test Placeholders
- **Playwright (frontend web)**: Create `apps/frontend/tests/pages/settings/settings-nav.spec.ts` with failing scenarios covering gear activation, focus management, section rendering, and telemetry defaults.
- **Playwright (desktop Electron)**: Mirror the above in `apps/desktop/tests/e2e/settings/settings-nav.e2e.spec.ts`, reusing the same selectors.
- **Vitest (preload)**: Add `apps/desktop/tests/preload/settings-bridge.spec.ts` to assert the preload bridge exposes the new `settings` namespace and enforces telemetry opt-out state.

All new tests must fail initially to honor TDD, referencing the planned preload typings and renderer behaviors described above.
