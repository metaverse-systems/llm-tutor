# LLM Tutor

An MIT-licensed, self-hostable tutoring platform that uses large language models to generate custom curricula and guide self-learners through lessons, practice, quizzes, and mastery assessments—all while keeping learner data local by default.

## Vision & Core Principles

- **Learner-First Accessibility** – Every interaction must meet WCAG 2.1 AA standards, remain fully usable via keyboard, and offer high-contrast and reduced-motion modes.
- **Curriculum Integrity & Assessment** – Generated curricula include learning objectives, module sequencing, formative practice, and summative assessments with feedback loops.
- **Local-First Privacy & Data Stewardship** – All content, prompts, and learner records stay on the local machine unless the learner explicitly opts into a remote model.
- **Transparent & Controllable AI Operations** – Prompts, responses, and model provenance are logged locally so learners can review, rerun, or override decisions.
- **Quality-Driven TypeScript Web Delivery** – The entire stack runs on TypeScript/Node.js with automated testing, accessibility audits, and consumer-grade hardware targets.

## Key Capabilities

- On-demand curriculum generation for any subject the underlying LLM understands.
- Interactive tutoring sessions that adapt to learner progress and remediation needs.
- Built-in quizzes, tests, and mastery tracking with answer keys and feedback guidance.
- Local-first execution leveraging `llama.cpp`, with optional Azure AI Foundry integration when remote compute is desired.
- Extensible architecture designed for additional LLM backends, content sources, and analytics.

## Project Structure (Planned)

```
llm-tutor/
├── apps/
│   ├── backend/           # Node.js/TypeScript API, orchestration, data access
│   ├── frontend/          # Accessible web UI for learners
│   └── desktop/           # Electron shell bundling backend + frontend for installers
├── packages/
│   └── shared/            # Reusable domain models, schema definitions, utilities
├── tests/
│   └── e2e/               # Cross-app end-to-end and accessibility test suites
├── docs/                  # Architecture diagrams, testing reports, user guides
└── .specify/              # Project automation templates and constitution
```

> The repository scaffold will evolve as the first feature plan is executed; keep this section current as directories are added.

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- llama.cpp
- Optional: Access to an Azure AI Foundry deployment if you plan to use remote inference
- Optional (for packaging): platform-specific build tooling for Electron (`xcode-select --install` on macOS, `build-essential` on Linux, Visual Studio Build Tools on Windows)

### Installation

```bash
# Clone the repo
git clone https://github.com/metaverse-systems/llm-tutor.git
cd llm-tutor

# Install dependencies (placeholder until packages are defined)
npm install
```

### Styling & Tailwind Workflow

The monorepo standardizes CSS/SCSS formatting and Tailwind generation across all
workspaces. Run these commands from the repository root unless otherwise noted:

- Format styles (CSS, SCSS, Tailwind layer files) in every workspace:

  ```bash
  npm run format:css
  ```

- Check formatting without writing changes (used by CI):

  ```bash
  npm run format:css -- --check
  ```

- Build Tailwind artifacts for every workspace (frontend, desktop renderer,
  backend docs, shared package):

  ```bash
  npm run tailwind:build
  ```

- Watch Tailwind inputs for live rebuilds while developing a renderer or web
  view:

  ```bash
  npm run tailwind:watch -- --workspace @metaverse-systems/llm-tutor-frontend
  ```

Individual workspaces expose identical scripts, so you can target a single
package via `npm run <script> --workspace <package-name>`. Generated `.tailwind`
artifacts are ignored by Git and excluded from Prettier. See
`docs/frontend-quickstart.md` for renderer-specific workflows and troubleshooting.

### Desktop shell (Electron)

Run the desktop experience alongside the backend and frontend dev servers:

```bash
npm run dev --workspace @metaverse-systems/llm-tutor-desktop
```

This script:

- launches Vite for the renderer UI,
- starts the backend in development mode,
- watches the Electron main/preload TypeScript sources, and
- opens an Electron window pointed at the Vite dev server.

Build the desktop application for distribution (after running frontend/backend builds):

```bash
npm run build --workspace @metaverse-systems/llm-tutor-frontend
npm run build --workspace @metaverse-systems/llm-tutor-backend
npm run package --workspace @metaverse-systems/llm-tutor-desktop
```

### Local LLM Runtime Expectations

LLM Tutor assumes a local LLM runtime—typically `llama.cpp`—is already running. Capture
its host, port, and model details in your environment configuration so the backend can route
requests. Future docs will point to the exact config file once the backend scaffold lands.

### Optional: Configure Azure AI Foundry Endpoint

1. Provision a deployment in Azure AI Foundry and collect the endpoint URL, key, and deployment name.
2. Create a `.env.azure` file with the following variables:

   ```bash
   AZURE_OPENAI_ENDPOINT="https://<resource-name>.openai.azure.com/"
   AZURE_OPENAI_KEY="<your-key>"
   AZURE_OPENAI_DEPLOYMENT="<deployment-name>"
   ```

3. Update the application configuration (forthcoming) to reference the Azure profile. All remote usage must remain opt-in and clearly disclosed to learners.

## Testing & Quality Gates

Testing is organized around the constitution’s quality requirements:

- **Unit tests** (Vitest/Jest) for domain logic and service orchestration.
- **Integration tests** covering curriculum generation pipelines and tutoring flows.
- **Accessibility tests** using Playwright + axe/Lighthouse to enforce WCAG 2.1 AA compliance.
- **End-to-end smoke tests** to validate offline execution against the configured local LLM
  before every release.

Once the codebase is scaffolded, the following commands will be available:

```bash
# Run unit tests
npm test

# Run accessibility and e2e suites
npm test:e2e
npm test:a11y
```

## Data Governance

- All learner data, prompts, responses, and embeddings must remain on local storage by default.
- Provide export/delete flows that do not require external services.
- Remote LLM usage is opt-in; clearly warn users what data leaves the device and allow them to revert to local mode at any time.

## Roadmap Highlights

- [ ] Scaffold backend/frontend projects and shared packages
- [ ] Implement initial curriculum generation feature
- [ ] Build tutoring session loop with progress tracking
- [ ] Integrate assessment engine with quizzes and tests
- [ ] Add analytics dashboard for learner insights (optional)

## Contributing

Contributions are welcome once the initial scaffolding lands. Please open an issue describing your proposal, reference the relevant constitutional principles, and include testing and accessibility plans in any pull request.

## License

This project is licensed under the [MIT License](./LICENSE).
