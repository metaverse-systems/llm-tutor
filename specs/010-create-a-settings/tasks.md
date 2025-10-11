1. [ ] Draft failing Playwright web spec `apps/frontend/tests/pages/settings/settings-nav.spec.ts` asserting gear activation, focus landing on the Settings heading, section visibility, telemetry default off, and axe checks against the Settings container.
2. [ ] [P] Draft failing Playwright Electron spec `apps/desktop/tests/e2e/settings/settings-nav.e2e.spec.ts` mirroring the web scenarios with the desktop test harness (Blocked by Task 1 for shared selector conventions).
3. [ ] [P] Add failing Vitest preload suite `apps/desktop/tests/preload/settings-bridge.spec.ts` covering the new `window.llmTutor.settings` namespace, telemetry state defaults, and consent timestamp handling.
4. [ ] Introduce shared `TelemetryPreference` typings (e.g., in `packages/shared/src/contracts`) and update any existing preference-related types to reuse them.
5. [ ] Extend the desktop preload bridge to expose the `settings` namespace with `navigateToSettings`, `telemetry.getState`, and `telemetry.setState`, persisting opt-out defaults and consent timestamps (Blocked by Task 3).
6. [ ] Update desktop main/navigation modules to handle `navigateToSettings` calls, wire focus restoration after exiting Settings, and ensure route changes respect existing IPC budgets (Blocked by Task 5).
7. [ ] Register the `/settings` route in both frontend and desktop router setups, including history integration and scroll restoration consistent with existing pages (Blocked by Task 6).
8. [ ] Build the Settings page shell with top-level `<h1>`, focus-on-mount behavior, and "Return to previous view" skip link wired to the stored prior focus target (Blocked by Task 7).
9. [ ] Implement the General section with theme selector reuse and telemetry toggle copy referencing opt-out defaults, using the preload bridge/shared types for state management (Blocked by Task 8).
10. [ ] Embed the existing LLM Profiles management panel within the Settings layout, ensuring heading hierarchy and responsive layout remain intact (Blocked by Task 8).
11. [ ] Implement the Diagnostics section with export action and retention guidance links using existing diagnostics services and providing disabled-state messaging when unavailable (Blocked by Task 8).
12. [ ] Introduce the persistent gear icon in the global header for both web and desktop shells, including active styling, aria labeling, and keyboard operability; ensure focus returns correctly when leaving Settings (Blocked by Task 9).
13. [ ] Synchronize telemetry preference persistence across renderer and backend contexts, guaranteeing opt-out defaults on first run and storing consent timestamps on opt-in (Blocked by Task 9).
14. [ ] Update Playwright test harness configuration (web and Electron) if needed to register the new specs and include axe scans for the Settings route (Blocked by Tasks 1-2).
15. [ ] Execute relevant unit and e2e test suites (Vitest preload, Playwright web, Playwright Electron) and resolve any remaining failures (Blocked by Tasks 4-14).
