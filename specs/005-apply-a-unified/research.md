# Research: Unified Visual Theme Rollout

_Last updated: 2025-10-09_

## 1. Baseline Audit
- **Tailwind configuration**: `tailwind.config.cjs` currently exposes default palette with minimal custom tokens. No shared color scale or typography tokens beyond Tailwind defaults. Frontend and desktop both import root config via local entrypoints (`apps/frontend/src/styles/tailwind.css`, `apps/desktop/src/renderer/styles/tailwind.css`).
- **Component styling**: Key surfaces (`DiagnosticsPanel.tsx`, `pages/landing/index.tsx`, `AccessibilityToggles.tsx`) rely on bespoke BEM classes defined in legacy CSS files. Very few Tailwind utility classes are used, resulting in divergence between frontend and Electron renderer.
- **Asset pipeline**: Vite + PostCSS pipeline already configured; adding additional Tailwind layers or custom plugins will go through existing `tailwind-build.cjs` script. Desktop renderer builds with the same Tailwind entry file bundled through Electron's Vite configuration.

## 2. Target Experience Requirements
- Single source of truth for color, typography, spacing, elevation, opacity, and motion tokens with named semantic roles (e.g., `surface.primary`, `text.muted`, `border.subtle`).
- Dedicated high-contrast variants for every token per spec clarification (FR-003a). High-contrast mode must work in both frontend and Electron renderer with identical semantics.
- Respect system reduced-motion preference and allow opt-in toggles to override defaults in-app. Animations should degrade gracefully without impact on usability.
- Maintain or improve current accessibility results (WCAG 2.1 AA) validated via Playwright + axe automation.

## 3. Solution Directions
- **Token storage**: Author token definitions in TypeScript under `packages/shared/src/styles/tokens.ts`, export JSON snapshot during build for renderer consumption. Supplement with generated CSS variables to keep runtime class usage minimal.
- **Tailwind integration**: Extend Tailwind theme using `tailwind.config.cjs` `theme.extend` with token-driven values. Introduce custom plugin to emit variant classes (high-contrast, reduced-motion) for relevant utilities.
- **Component migration**: Replace BEM class names with Tailwind utility stacks referencing new semantic tokens. Bundle domain-specific compositions as Tailwind `@apply` mixins if repeated.
- **Desktop alignment**: Ensure renderer uses same compiled CSS via shared build step—potentially add `prebuild` script syncing generated CSS and token JSON from shared package.

## 4. Accessibility & QA Strategy
- Automated axe audits on themed pages and Electron renderer window via Playwright harness.
- Snapshot tests for token JSON to guard accidental drift and ensure high-contrast entries exist for every semantic token.
- Manual smoke checklist for color contrast (minimum 4.5:1 normal, 3:1 large text) and keyboard focus visibility after migration.

## 5. Risks & Mitigations
-|Risk|-|Impact|-|Mitigation|
|---|---|---|---|
|Tailwind purge removing dynamic classes|High|Use safelist entries based on token names and state variants in config; document usage in quickstart.| 
|Electron renderer lag from larger CSS bundle|Medium|Monitor bundle size delta; keep generated CSS modular and tree-shake unused utilities.| 
|Inconsistent high-contrast behavior|High|Centralize variant toggles in shared hook; add integration tests covering both environments.| 
|Contributor confusion about tokens|Medium|Provide quickstart, lint rules, and Prettier plugin notes to enforce usage.| 

## 6. Open Questions
- Do we introduce dark/light themes in parallel with high-contrast? _Deferred to future spec (not required here)._ 
- Should token definitions live in JSON or TypeScript? _Leaning TypeScript for type safety with generated JSON output._

## 7. Next Steps
1. Draft data model describing token structure and variant mapping.
2. Design quickstart walkthrough for contributors adding/updating tokens.
3. Produce contract artifacts (`theme.tokens.json`, `theme-ci.md`) reflecting decisions above.
4. Outline migration tasks and testing matrix in `/specs/005-apply-a-unified/tasks.md` once `/tasks` command executed.
