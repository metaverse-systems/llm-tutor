# Tasks: Monorepo CSS/SCSS Formatting Workflow with Tailwind

**Input**: Design documents from `/specs/004-add-css-formatting/`
**Prerequisites**: `plan.md`, `research.md`, `data-model.md`, `quickstart.md`

## Execution Flow (main)
```
1. Load plan, research, data-model, quickstart
2. Confirm shared formatting + Tailwind policy decisions and workspace scope
3. Generate tasks: setup → tests → core commands → integration → polish
4. Apply rules: tests before implementation, mark [P] for independent files
5. Number tasks sequentially (T001, T002, ...)
6. Provide dependency and parallel guidance
7. Return ordered list ready for Task agent execution
```

## Phase 3.1: Setup & Validation
- [x] T001 Ensure repository dependencies are installed and up to date (`npm install`) so Prettier, Tailwind, and PostCSS packages resolve correctly during subsequent steps. *(Completed via `npm install` on 2025-10-09; lockfile unchanged and audit clean.)*
- [x] T002 Audit existing scripting surface in root `package.json` and each workspace `package.json` (backend, frontend, desktop, shared) to document current format/lint/tailwind-related commands before introducing new scripts. *(Existing scripts recorded in plan notes: root lacks `format:css`/Tailwind entries; workspaces expose lint/test but no formatting or Tailwind scripts yet.)*

## Phase 3.2: Tests First (Formatter & Tailwind Verification)
\- [x] T003 [P] Author a no-op CSS fixture in `apps/frontend/tests/unit/__fixtures__/formatter/frontier.css` demonstrating intentional mis-formatting to validate future formatter commands. *(Added gradient-heavy `.button` rule with compressed spacing to highlight formatter rewrites.)*
\- [x] T004 [P] Add a similar SCSS fixture in `apps/frontend/tests/unit/__fixtures__/formatter/frontier.scss` for SCSS coverage. *(Created nested `.hero`/`.cta-button` structure with variables and intentionally collapsed declarations.)*
\- [x] T005 Create a Vitest sanity check in `apps/frontend/tests/unit/formatter.spec.ts` that asserts running the formatter rewrites both fixtures (use `execa` to invoke the local script and compare file contents). *(New test copies fixtures to a temp dir, runs `npm run format:css --workspace @metaverse-systems/llm-tutor-frontend -- <files>`, and compares results to Prettier-formatted expectations.)*
\- [x] T006 Add a Tailwind smoke test in `apps/frontend/tests/unit/tailwind-build.spec.ts` that spawns `npm run tailwind:build --workspace @metaverse-systems/llm-tutor-frontend` and expects failure until configs/scripts exist, capturing stderr for future debugging. *(New test invokes the workspace Tailwind build script via `execa` and expects a zero exit code—currently red because the script has not been created yet.)*

## Phase 3.3: Core Implementation
\- [x] T007 Add devDependencies to root `package.json` for `tailwindcss`, `postcss`, `autoprefixer`, and `prettier-plugin-tailwindcss`; regenerate the lockfile. *(Installed via `npm install` and verified lock refresh.)*
\- [x] T008 Create root-level Tailwind config `tailwind.config.ts` and PostCSS config `postcss.config.cjs` aligned with research decisions (content globs, theme extensions, plugins). *(Config includes shared content globs, brand palette, and PostCSS pipeline with Tailwind + Autoprefixer.)*
\- [x] T009 Create root-level Prettier configuration `prettier.config.cjs` capturing shared CSS/SCSS rules, enabling `prettier-plugin-tailwindcss`, and exporting overrides for `.css`, `.scss`, and Tailwind layer files. *(Config committed at repo root with Tailwind plugin enabled.)*
\- [x] T010 Update root `package.json` scripts to add `format:css` (delegating to workspaces via `npm run format:css --workspaces --if-present`) and include a root fallback for any top-level styles. *(Script backed by `scripts/format-css.cjs` for argument forwarding and root fallbacks.)*
\- [x] T011 Add `format:css`, `tailwind:build`, and `tailwind:watch` scripts to `apps/frontend/package.json`, wiring them to Vite/PostCSS as appropriate and creating `src/styles/tailwind.css` with base/import layers. *(Scripts added and Tailwind entry imported by `src/index.tsx`; tests now pass.)*
\- [x] T012 Add equivalent scripts and entry files to `apps/desktop/package.json` (pointing to Electron renderer styles directory) and ensure build steps integrate with Vite config. *(Placed renderer Tailwind entry and CLI scripts targeting `.tailwind/desktop.css`.)*
\- [x] T013 Add formatting and Tailwind build scripts to `apps/backend/package.json` (scoped to any shared styles or documentation assets) even if currently minimal, keeping globs future-proof. *(Workspace formatter delegates to shared helper; Tailwind build produces `.tailwind/backend.css`.)*
\- [x] T014 Add scripts to `packages/shared/package.json` for shared component styles and create Tailwind entry file if components consume utilities. *(Shared package now exposes formatter/Tailwind scripts with entry at `src/styles/tailwind.css`.)*
\- [x] T015 Introduce shared `.prettierignore` (if missing) or update existing ignore lists to exclude generated Tailwind artifacts (`**/tailwind.generated.css`, `**/dist/**`). *(New `.prettierignore` and expanded `.gitignore` cover Tailwind outputs.)*
\- [x] T016 Implement root npm script alias `format` (if present) to chain existing formatting with the new CSS formatter, ensuring workflows remain one-command for contributors. *(Root `format` now delegates to `format:css` for single-command workflows.)*
\- [x] T017 Update workspace build pipelines (e.g., `apps/frontend/vite.config.ts`, Electron bundler) to reference Tailwind entry files so utilities compile automatically during dev/build. *(Frontend boot now imports `styles/tailwind.css`; Tailwind scripts validated across workspaces.)*

## Phase 3.4: Integration & CI
- [x] T018 Update CI workflow (e.g., `.github/workflows/ci.yml`) to run `npm run format:css -- --check` after linting and execute `npm run tailwind:build -- --ci` (or equivalent) to confirm configs compile in headless environments. *(Added dedicated CI workflow running lint, formatter check, Tailwind build, and tests on Node 20 with npm cache.)*
- [x] T019 Wire the new formatter and Tailwind build steps into local quality gates by updating any dev tooling scripts (e.g., `npm run lint` pipelines or pre-commit hooks) so contributors experience the same enforcement locally. *(Root lint script now shells through `scripts/lint-all.cjs`, enforcing formatter + Tailwind runs unless `LINT_SKIP_ENFORCEMENT=true`.)*

## Phase 3.5: Documentation & Polish
- [x] T020 Update root `README.md` contributor workflow section to call out `npm run format:css` and Tailwind build/watch usage, including check mode guidance and accessibility considerations for utilities.
- [x] T021 Update frontend quickstart references in the main docs (`docs/architecture.md`, existing frontend quickstart) so Tailwind setup and formatter steps stay in sync.
- [x] T022 [P] Add CI troubleshooting documentation in `docs/testing-log.md` or relevant doc to explain resolving formatter or Tailwind build failures.
- [x] T023 [P] Evaluate whether fixtures created in T003–T004 should remain as regression tests; if retired, remove them and document the rationale in the commit.

## Dependencies
- T001 precedes all other tasks (tooling availability).
- T002 informs updates to scripts (T010–T017, T020).
- T003–T006 must exist before modifying scripts/configurations (T007–T017) to follow TDD principles.
- T007 enables Tailwind config creation (T008) and Prettier plugin setup (T009).
- T009 must precede workspace script additions (T011–T014) since they rely on the shared config.
- T017 depends on Tailwind configs and entry files being in place (T008, T011–T014).
- T018 depends on completion of T007–T017.
- Documentation tasks (T020–T023) depend on implementation tasks to avoid stale guidance.

## Parallel Execution Guidance
```
# After T003–T006 are complete and failing, run workspace script additions together:
Task: "T011 Add format:css and Tailwind scripts to apps/frontend/package.json ..."
Task: "T012 Add equivalent scripts to apps/desktop/package.json ..."
Task: "T013 Add formatting and Tailwind build scripts to apps/backend/package.json ..."
Task: "T014 Add scripts to packages/shared/package.json ..."

# For polish phase:
Task: "T022 [P] Add CI troubleshooting documentation ..."
Task: "T023 [P] Evaluate fixture retention ..."
```

## Notes
- Maintain Prettier cache usage (`--cache`) in workspace scripts for performance.
- Keep formatter and Tailwind commands deterministic; avoid environment-dependent globs or network fetches.
- Ensure CI failure messages remain accessible (clear instructions on running the formatter and Tailwind build locally).
