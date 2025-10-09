# Research: Monorepo CSS/SCSS Formatting Workflow

_Last updated: 2025-10-09_

## Research Summary
A shared Prettier toolchain and Tailwind CSS baseline will standardise styling across the monorepo while respecting the repository's offline-first workflow. The decisions below outline how configuration, commands, documentation, and CI integration work together so contributors experience a predictable formatter and utility framework regardless of workspace.

## Decision Log

### D001 – Shared Prettier configuration strategy
- **Decision**: Author a single `prettier.config.cjs` at the repository root that exports the house style (print width 100, single quotes, 2-space indentation) and explicitly extends to CSS and SCSS via `overrides`. All workspaces reference this file instead of maintaining separate Prettier configs.
- **Rationale**: A root-level configuration prevents divergence between packages, keeps options aligned with existing TypeScript formatting preferences, and simplifies future updates. Prettier natively supports CSS/SCSS, so no additional plugin is required. Checking the config into version control satisfies the "Transparent & Controllable AI Operations" principle by making formatting rules auditable.
- **Alternatives Considered**:
  1. **Workspace-local configs** – rejected because duplication increases drift risk and forces manual sync when adjusting rules.
  2. **Delegating to ESLint formatting rules** – rejected because the repo already depends on Prettier, and ESLint's formatter would reintroduce stylistic lint noise the team previously removed with `eslint-config-prettier`.

### D002 – Command surface and workspace orchestration
- **Decision**: Introduce `format:css` scripts at the root and within each workspace that owns styling assets (`apps/backend`, `apps/frontend`, `apps/desktop`, `packages/shared`). Workspace scripts call `prettier --cache` with glob coverage for CSS/SCSS under their respective source directories. The root script delegates to workspaces using `npm run format:css --workspaces --if-present` and falls back to the root Prettier invocation for any top-level styles.
- **Rationale**: Contributors can target a single workspace when iterating locally or run the aggregated root script before committing. Leveraging `npm run --workspaces` honours the existing tooling model and keeps the workflow offline. Using Prettier's cache improves performance so the formatter remains within CI budgets.
- **Alternatives Considered**:
  1. **Custom Node CLI to traverse directories** – rejected as unnecessary complexity; npm workspaces already provide the needed orchestration.
  2. **Git hook only** – rejected because contributors still need explicit scripts for local runs, and CI must enforce the same behaviour.

### D003 – CI quality gate integration
- **Decision**: Extend the shared quality gate so CI runs `npm run format:css -- --check` after linting, failing fast when files are unformatted. Update documentation (root `README.md`, frontend quickstart) to reflect the formatter stage and recommended workflows (format locally before pushing, rely on CI for verification).
- **Rationale**: Keeping the formatter in CI ensures consistency regardless of developer tooling and prevents unformatted styles from reaching main. Documenting the workflow aligns with the constitution's "Quality-Driven TypeScript Web Delivery" gate and gives contributors clear expectations.
- **Alternatives Considered**:
  1. **Manual reviewer enforcement** – rejected because it is error-prone and increases reviewer workload.
  2. **Lint-only enforcement** – rejected since ESLint cannot guarantee stylistic consistency for CSS/SCSS and would miss property ordering/spacing issues Prettier solves automatically.

  ### D004 – Tailwind CSS adoption pattern
  - **Decision**: Install Tailwind CSS, PostCSS, and Autoprefixer as root-level dev dependencies, expose a shared `tailwind.config.ts` and `postcss.config.cjs`, and generate workspace-specific entrypoints (`apps/frontend/src/styles/tailwind.css`, etc.) that import Tailwind layers. Provide npm scripts (`tailwind:build`, `tailwind:watch`) per workspace that leverage Vite or PostCSS CLI depending on bundler support.
  - **Rationale**: Root-level dependencies simplify version management while allowing each workspace to opt in via imports. A shared config centralises design tokens (colours, typography, accessibility presets) and keeps the build pipeline offline. Scripts map directly to existing tooling: Vite handles Tailwind during dev/build for frontend/desktop, while backend/shared can use PostCSS CLI for generating static CSS when needed.
  - **Alternatives Considered**:
    1. **Per-workspace Tailwind installs** – rejected due to duplication and higher maintenance overhead when upgrading Tailwind.
    2. **CDN-delivered Tailwind** – rejected because it violates the local-first principle and complicates offline packaging for Electron.

  ### D005 – Tailwind & Prettier coexistence
  - **Decision**: Enable Prettier's Tailwind plugin (`prettier-plugin-tailwindcss`) to sort utility classes, and update ignore rules to exclude Tailwind build artifacts (`dist/tailwind.css`, etc.) while formatting source files (`tailwind.css`, component CSS/SCSS).
  - **Rationale**: The plugin keeps utility class ordering predictable, reducing diff noise and ensuring accessibility-related class groups stay intact. Ignoring generated files prevents endless churn from build outputs while still enforcing the source-of-truth styles.
  - **Alternatives Considered**:
    1. **Manual class ordering guidelines** – rejected; error-prone and inconsistent across contributors.
    2. **Formatting generated Tailwind output** – rejected because the files are recreated on every build and don't benefit from formatting enforcement.

## Open Questions
None. All formatting scope questions are resolved for planning purposes.
