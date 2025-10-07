<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- Modified principles: Local-First Privacy & Data Stewardship (removed mandatory encryption requirement)
- Added sections: None
- Removed sections: None
- Templates requiring updates: ✅ .specify/templates/plan-template.md, ✅ .specify/templates/spec-template.md, ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: None
-->

# LLM Tutor Constitution

## Core Principles

### Learner-First Accessibility
The product MUST deliver an inclusive, self-paced learning experience for independent
learners with diverse backgrounds and abilities. All user interfaces MUST satisfy WCAG 2.1
AA criteria, maintain full keyboard operability, provide scalable typography, furnish
alternative text for media, and expose high-contrast and reduced-motion modes. Learning
content MUST be written in plain language with optional scaffolding so that new learners can
adjust depth without leaving the platform.

### Curriculum Integrity & Assessment
Every generated curriculum MUST articulate learning objectives, module sequencing, and
clear completion criteria. Each module MUST include formative practice, quizzes, or tests,
and major milestones MUST culminate in summative assessments with answer keys and
feedback guidance. The tutoring loop MUST track learner progress, store assessment
artifacts, and surface remediation prompts whenever mastery is not demonstrated.

### Local-First Privacy & Data Stewardship
The system MUST operate fully offline using a locally hosted LLM (llama.cpp) and local
storage by default. Remote LLM endpoints (e.g., Azure AI Foundry) MAY be enabled only with
explicit user opt-in, transparent disclosure of data sent, and the ability to disable them at
any time. All learner data, prompts, responses, and embeddings MUST persist locally in a
relational database or vector store, with data export/delete flows available without relying
on external services. Encryption of local data is encouraged when feasible but is not
required for compliance.

### Transparent & Controllable AI Operations
All AI interactions MUST be auditable. Prompts, system instructions, and model responses
MUST be recorded locally with timestamps and model provenance. The learner MUST be able
to review, rerun, or override AI outputs and swap models within supported backends without
code changes. Safety filters and content guardrails MUST be enforced consistently across
local and remote providers, with fallback plans documented for degradation or refusal
responses.

### Quality-Driven TypeScript Web Delivery
The application MUST be implemented as a TypeScript-based Node.js web app with automated
testing as the default development mode. Accessibility, unit, integration, and end-to-end
tests MUST exist for every shipped feature, and continuous integration MUST block merges
when coverage or accessibility checks regress. Code MUST adhere to the MIT license, be
modular, and remain deployable on consumer-grade hardware without GPU requirements.

## Technical Standards & Constraints

- **Architecture**: Web application with a TypeScript/Node.js backend and an accessible web
  frontend. Services MUST expose clear module boundaries for curriculum planning,
  tutoring, assessment, analytics, and model orchestration.
- **LLM Backends**: Support llama.cpp as the baseline local runtime; Azure AI Foundry or
  other hosted endpoints are OPTIONAL add-ons behind explicit consent toggles and feature
  flags.
- **Data Layer**: Primary persistence MUST be a local relational database (e.g., SQLite,
  PostgreSQL) supplemented by a local vector index when retrieval-augmented generation is
  required. No learner-identifying data may be transmitted or stored remotely.
- **Accessibility Tooling**: Automated audits (e.g., axe-core, Lighthouse) MUST run within
  the development workflow, and manual accessibility reviews MUST accompany major UI
  changes.
- **Licensing**: All first-party code, documentation, and templates MUST be released under
  the MIT License. Third-party assets MUST be compatible with MIT distribution and tracked
  in attribution files.

## Development Workflow & Quality Gates

- **Version Control**: Maintain a trunk-based Git workflow with feature branches. Every
  pull request MUST cite relevant constitutional principles and include automated test and
  accessibility results.
- **Testing Strategy**: Adopt test-driven development. Each feature MUST introduce failing
  unit, integration, and end-to-end tests (including assessment-generation scenarios) before
  implementation. Regression suites MUST cover curriculum generation accuracy, quiz
  validation, accessibility rules, and offline operation.
- **Release Readiness**: A release candidate MUST pass: (1) full automated test suite,
  (2) accessibility audit, (3) offline functional smoke test against llama.cpp, and (4)
  documentation updates for curriculum behavior and AI backend selection.
- **Documentation**: Maintain up-to-date architectural diagrams, data retention policies,
  and user-facing guides describing model configuration, local storage locations, and
  privacy guarantees.

## Governance

- **Ownership**: Tim (Project Lead) is the current maintainer and final decision authority.
  External contributions MAY be accepted if they comply with this constitution and the MIT
  license, but Tim retains veto power to protect learner safety and accessibility.
- **Amendments**: Proposed changes MUST be documented in an issue describing rationale,
  principle impacts, and migration plans. Adopted amendments MUST increment the
  constitution version per semantic rules, update this document, and adjust dependent
  templates before merging.
- **Review Cadence**: Conduct a quarterly self-audit covering accessibility metrics,
  curriculum fidelity, data governance, and AI safety practices. Document findings and
  follow-up tasks in the repository.
- **Compliance**: All feature work MUST reference this constitution during planning and
  review. Deviations require a temporary exception recorded with justification and a plan to
  restore compliance.

**Version**: 2.0.0 | **Ratified**: 2025-10-06 | **Last Amended**: 2025-10-06