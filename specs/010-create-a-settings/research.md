# Research Log – Settings Page Accessible from Global Header

## Focus management for Settings route in Electron + web shells
- **Decision**: Use page-level focus management that sets focus on the top-level `<h1>` heading of the Settings page and provide a dedicated "Return to previous view" skip link.
- **Rationale**: WAI-ARIA Authoring Practices recommends moving focus to the main heading when navigating to a new view to avoid screen readers re-reading the entire shell. A skip link enables learners to return to the prior content without tabbing through all sections.
- **Alternatives considered**: Keeping focus on the header icon (risk of focus loss when the page re-renders); trapping focus within Settings (would violate expectation for standard page navigation and conflict with diagnostics links).

## Telemetry opt-out consent messaging
- **Decision**: Present telemetry controls with copy that explains data stays local unless the learner explicitly enables telemetry, emphasizing the opt-out default and linking to diagnostics export guidance.
- **Rationale**: Aligns with the constitution’s Local-First Privacy principle and matches common privacy-forward UX patterns (e.g., Mozilla telemetry dialogs) where users must actively opt in. Reinforces trust by restating local storage guarantees.
- **Alternatives considered**: Silent opt-out without messaging (fails transparency expectations); enabling telemetry by default (conflicts with clarified requirement and constitution).

## Shared Playwright + axe coverage for Electron and web builds
- **Decision**: Add Playwright specs that run against the existing web dev server first, then reuse the same selectors in the Electron E2E harness by toggling build-specific helpers; pair each scenario with axe checks on the Settings page container.
- **Rationale**: This mirrors current cross-target testing strategy (per existing LLM profile specs) and keeps selectors consistent. axe assertions ensure we detect regressions to headings, aria labels, and focusable elements.
- **Alternatives considered**: Maintaining separate spec files per platform (duplicates scenarios and increases maintenance); relying solely on unit tests (insufficient to cover navigation and accessibility guarantees).
