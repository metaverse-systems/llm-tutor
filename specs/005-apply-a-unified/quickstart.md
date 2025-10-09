# Quickstart: Working with the Unified Theme

_Last updated: 2025-10-09_

## 1. Prerequisites
- Node.js 20, pnpm (workspaces) installed.
- Run `pnpm install` at repo root if dependencies changed.
- Familiarity with Tailwind CSS and React component structure in `apps/frontend` and `apps/desktop`.

## 2. Generate Theme Assets
1. Update token definitions in `packages/shared/src/styles/tokens.ts`.
2. Run `pnpm build:tokens` (to be added in tasks) to output:
   - `packages/shared/dist/theme.tokens.json`
   - `packages/shared/dist/theme.css`
3. Frontend and desktop builds automatically include generated CSS via Tailwind entry files.

## 3. Applying Tokens in Components
- Prefer semantic Tailwind classes: e.g., `bg-surface-primary`, `text-body-strong`, `border-border-muted`.
- Utilities map to generated CSS variables; never hard-code hex values.
- If a composite pattern repeats, author a `.theme-card` layer within `@layer components` referencing utilities.

## 4. High-Contrast & Reduced Motion
- Use `data-theme="contrast"` attribute on `<body>` or root container to activate high-contrast tokens.
- Access `useThemeMode()` from shared package to toggle appearance/motion modes. Hook synchronizes with system preferences and persists user overrides.
- Test modes locally:
  - Web: open DevTools command palette → “Rendering” → emulate CSS media features.
  - Desktop: use new command palette entry `Toggle High Contrast` (to be implemented) and confirm focus outlines.

## 5. Testing Checklist
- `pnpm test:unit --filter theme` (Vitest snapshot coverage for tokens).
- `pnpm test:playwright` (runs axe accessibility audits on themed pages/windows).
- Manually verify keyboard focus, color contrast (use Chrome DevTools contrast checker), and motion reduction on key flows.

## 6. Contribution Guidelines
- Any new visual asset must declare tokens for both standard and high-contrast modes.
- Update `docs/release-notes` with token changes (new, updated, deprecated).
- Run `pnpm lint:css` (Task to add) to ensure Tailwind safelist rules satisfied.
- Keep `packages/shared/src/styles/index.ts` exporting token helpers for consumers; import from shared package rather than direct paths.

## 7. Troubleshooting
- **Missing class at runtime**: ensure class name is present in Tailwind safelist or used in source; re-run build.
- **Electron not updating styles**: confirm generated CSS copied into desktop build artifacts; rerun `pnpm --filter desktop build`.
- **Contrast check failures**: adjust `contrast.high` values in token definition; rerun Vitest + Playwright suites.
