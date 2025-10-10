# Frontend Quickstart

_Last updated: 2025-10-10_

This quickstart helps contributors spin up the React renderer, apply the shared styling
workflow, and verify Tailwind utilities before committing changes.

## Prerequisites

- Node.js 20+
- Dependencies installed via `npm install`
- Optional: running backend (`npm run dev --workspace @metaverse-systems/llm-tutor-backend`) for
  integration testing while developing the UI

## 1. Generate theme assets (once per edit cycle)

```bash
npm run build:tokens
```

- Compiles the shared token catalogue and writes `packages/shared/dist/theme.tokens.json` + `theme.css`.
- Tailwind builds and the Electron renderer consume these artefacts automatically.
- Re-run after touching files under `packages/shared/src/styles/` or `packages/shared/src/hooks/useThemeMode.ts`.

> **Shortcut:** `npm run lint` performs this step automatically alongside Tailwind builds and accessibility suites.

## 2. Start the frontend dev server

```bash
npm run dev --workspace @metaverse-systems/llm-tutor-frontend
```

Vite serves the renderer at `http://localhost:5173/` with hot module replacement. When
working inside Electron, the desktop workspace reuses the same renderer bundle.

## 3. Apply the shared CSS/SCSS formatter

```bash
npm run format:css --workspace @metaverse-systems/llm-tutor-frontend
```

- Uses the root Prettier configuration with `prettier-plugin-tailwindcss`.
- Formats any `src/**/*.css` and `src/**/*.scss` files, including Tailwind layers.
- Run with `-- --check` to mirror CI enforcement.

## 4. Build Tailwind utilities

```bash
npm run tailwind:build --workspace @metaverse-systems/llm-tutor-frontend
```

- Generates `.tailwind/frontend.css`, which the Vite build consumes automatically.
- During active development, prefer the watch mode:

  ```bash
  npm run tailwind:watch --workspace @metaverse-systems/llm-tutor-frontend
  ```

- CI calls the root `npm run tailwind:build -- --ci`, which delegates to this command.

## 5. Run unit and accessibility tests

```bash
npm run test --workspace @metaverse-systems/llm-tutor-frontend
npm run test:a11y --workspace @metaverse-systems/llm-tutor-frontend
```

Vitest ensures renderer hooks remain stable, while Playwright + axe-core verifies
Accessibility guidelines against the running preview server.

Key theme suites:

- `tests/unit/theme.tokens.contract.test.ts` (shared workspace) ensures the token schema stays valid.
- `tests/accessibility/high-contrast.theme.spec.ts` (Playwright) toggles `useThemeMode` controls and asserts the renderer exposes `data-theme="contrast"`.

Run `npm run lint` to execute the entire sequence that CI enforces: linting, formatter check (read-only), token generation, Tailwind builds, Vitest theme suites, frontend accessibility spec, and the Electron diagnostics high-contrast run.

## 5. Troubleshooting

- **Formatter changed Tailwind order unexpectedly** – The Tailwind Prettier plugin sorts
  classes by the canonical ordering. Spot-check the rendered component; if the visual
  result differs, use utilities like `@apply` to group class names semantically.
- **Tailwind build fails with missing content sources** – Confirm new component paths are
  included in `tailwind.config.cjs` content globs. Re-run the build after updating.
- **Watch command exits immediately** – Ensure you pass through `--` when forwarding
  additional arguments (e.g., `npm run tailwind:watch -- --minify=false`).

---

Refer back to the root `README.md` for cross-workspace commands and to `docs/testing-log.md`
for CI troubleshooting steps when formatter, Tailwind, or token builds fail. The
diagnostics runbook (`docs/diagnostics.md`) also documents how the shared theme provider
syncs preferences across the desktop shell.
