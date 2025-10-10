# Data Model: Monorepo CSS/SCSS Formatting Workflow

_Last updated: 2025-10-09_

## Overview
The formatting initiative introduces shared configuration and documentation artifacts rather than persisted runtime data. The entities below describe the policy surfaces we maintain so tooling, scripts, and documentation stay aligned.

## Entities

### FormattingPolicy
| Field | Type | Notes |
| --- | --- | --- |
| `configPath` | string | Absolute path to the shared Prettier configuration (`{repoRoot}/prettier.config.cjs`). |
| `printWidth` | number | Maximum line length applied to CSS/SCSS files (default `100`). |
| `singleQuote` | boolean | Ensures CSS strings use single quotes for consistency with TypeScript formatting. |
| `tabWidth` | number | Tab width enforced in formatted output (default `2`). |
| `extensions` | array<string> | File extensions covered by the policy (`[".css", ".scss"]`). |
| `ignores` | array<string> | Glob patterns excluded from formatting (e.g., generated artifacts, build outputs). |
| `version` | string | SemVer of the formatting policy, incremented when rules change materially. |

### TailwindProfile
| Field | Type | Notes |
| --- | --- | --- |
| `configPath` | string | Absolute path to the shared Tailwind configuration (`{repoRoot}/tailwind.config.cjs`). |
| `postcssConfigPath` | string | Location of the PostCSS pipeline definition (`{repoRoot}/postcss.config.cjs`). |
| `contentGlobs` | array<string> | Globs mapping to component templates across workspaces to drive purge/safe-listing. |
| `themeExtensions` | object | Shared design tokens (colors, typography, spacing scales) added to Tailwind. |
| `plugins` | array<string> | Tailwind plugins enabled (e.g., forms, typography, accessibility helpers). |
| `buildTargets` | array<string> | Workspace-specific build outputs (e.g., `apps/frontend/src/styles/tailwind.css`). |

### WorkspaceFormattingCommand
| Field | Type | Notes |
| --- | --- | --- |
| `workspaceName` | string | npm workspace name (e.g., `@metaverse-systems/llm-tutor-frontend`). |
| `scriptName` | string | Script identifier (`format:css`). |
| `writeCommand` | string | Underlying Prettier invocation for write mode (documents glob coverage per workspace). |
| `checkCommand` | string | Equivalent invocation with `--check` for CI enforcement. |
| `lastUpdated` | ISO 8601 string | Timestamp when the script definition last changed. |

### DocumentationTouchpoint
| Field | Type | Notes |
| --- | --- | --- |
| `document` | enum (`"README.md"`, `"frontend quickstart"`) | Where the workflow is described. |
| `sectionHeading` | string | Heading that owns the formatting instructions. |
| `audience` | enum (`"maintainer"`, `"contributor"`) | Primary readers responsible for running the formatter. |
| `requiredSteps` | array<string> | Ordered steps the reader must take (e.g., "run npm run format:css", "commit formatted files"). |

## Relationships
- `FormattingPolicy` underpins every `WorkspaceFormattingCommand`; each command references the shared `configPath`.
- `TailwindProfile` feeds into workspace-specific build scripts and content globs, ensuring purge settings cover all component directories.
- `DocumentationTouchpoint` entries reference both the policy and workspace commands while linking to Tailwind sections so contributors understand utility usage.

## Outstanding Questions
None. Entities are documentation-oriented and align with the scope of the formatting workflow.
