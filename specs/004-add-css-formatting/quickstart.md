# Quickstart: CSS/SCSS Formatting Workflow

_Last updated: 2025-10-09_

This guide explains how maintainers and contributors run the shared formatter and Tailwind build pipeline after the tooling lands in Phase 3.

## Prerequisites
- Node.js 20 with workspace dependencies installed (`npm install`).
- Prettier 3.x installed through the repo’s dev dependencies (handled automatically by `npm install`).
- Local git workspace in a clean state (formatter may modify tracked files).

## Fast Path
1. **Install and verify tooling**
   ```bash
   npm install
   npm run lint --workspaces
   ```
   Running lint confirms the workspaces are healthy before formatting.

2. **Format styling assets across the monorepo**
   ```bash
   npm run format:css
   ```
   - Applies the shared Prettier configuration to all `.css` and `.scss` files.
   - The root script orchestrates workspace-level `format:css` commands, so contributors do not need to run them individually unless they are focused on a single package.

3. **Build Tailwind outputs for affected workspaces**
   ```bash
   npm run tailwind:build --workspaces --if-present
   ```
   - Generates workspace-specific Tailwind CSS outputs using the shared configuration.
   - Use `-- --watch` or workspace-specific scripts (e.g., `npm run tailwind:watch --workspace @metaverse-systems/llm-tutor-frontend`) during active development.

4. **Check formatting in CI mode (optional before pushing)**
   ```bash
   npm run format:css -- --check
   ```
   - Runs Prettier in check mode to ensure no files would be reformatted.
   - Mirrors the behaviour enforced in the CI quality gate.

5. **Commit and share**
   - Review `git status` to confirm only formatter changes are staged.
   - Commit with a message such as `chore: format css assets` when needed.

## Troubleshooting Checklist
- **Unexpected files skipped**: Confirm the file extension is `.css` or `.scss` and not excluded by `.gitignore` or the formatter ignore list. Add missing paths to the workspace script globs if needed.
- **Performance regressions**: The formatter uses Prettier’s cache; clear the cache (`rm -rf node_modules/.cache/prettier`) if stale results appear. Tailwind builds can be debugged by running workspace-specific watch scripts to observe incremental rebuild times.
- **CI failures**: Reproduce locally with `npm run format:css -- --check`, re-run the write mode command, and recommit. For Tailwind failures, run `npm run tailwind:build -- --watch` in the affected workspace and inspect the CLI output for missing content globs or configuration errors.

## Accessibility & Documentation Notes
- Documentation updates in `README.md` and the frontend quickstart reference this workflow so learners and contributors understand the formatting stage and Tailwind usage alongside accessibility expectations.
- When adding new styling assets for high-contrast or reduced-motion themes, re-run the formatter and Tailwind build to keep CSS tokens consistently formatted and discover regressions early. Tailwind utilities should be paired with semantic HTML and ARIA guidance documented alongside the shared config.
