# Research: Backend LLM Profile Operations

## Decision: Route Topology & Validation
- **Rationale**: All profile actions must share consistent envelopes between desktop IPC and backend HTTP. Adopting a dedicated Fastify plugin (`apps/backend/src/api/llm/profile.routes.ts`) keeps profile endpoints grouped and enables schema-driven validation using the shared Zod contracts from `@metaverse-systems/llm-tutor-shared`.
- **Alternatives Considered**:
  - Inline route registration inside `apps/backend/src/index.ts` (rejected: duplicates config and complicates future feature toggles).
  - Reusing existing diagnostics routes (rejected: violates separation between diagnostics and profile management APIs).

## Decision: Error Mapping Strategy
- **Rationale**: The backend must translate service layer exceptions (`ProfileServiceError`, `SafeStorageUnavailableError`, `TestPromptTimeoutError`) into the `ProfileErrorCode` enum. Centralising this in a mapper utility avoids scattered try/catch logic and guarantees parity with IPC layer behaviour.
- **Alternatives Considered**:
  - Returning raw error messages (rejected: inconsistent with contracts and inaccessible for localisation).
  - Mapping errors inside each route handler (rejected: increases duplication and risk of drift between endpoints).

## Decision: Diagnostics Emission
- **Rationale**: Each HTTP handler should invoke the existing diagnostics recorder with correlation IDs and timing data. Reusing the recorder contract ensures logs align with desktop IPC events and keeps audit trails complete for accessibility and privacy reviews.
- **Alternatives Considered**:
  - Emitting console logs only (rejected: insufficient for correlation and violates transparency principle).
  - Creating new diagnostics format (rejected: unnecessary divergence from established JSONL pipeline).

## Decision: Discovery Probe Integration
- **Rationale**: Auto-discovery should leverage the existing `createLlmProbe` utilities configured for diagnostics to minimise new dependencies and share retry behaviour. The backend delegates scanning logic to a dedicated service so contract tests can stub it easily.
- **Alternatives Considered**:
  - Implementing HTTP probing directly within the route handler (rejected: breaks single-responsibility and complicates testing).
  - Delaying discovery support (rejected: contract tests require coverage to pass).

## Decision: Performance Budget Enforcement
- **Rationale**: Handlers capture `Date.now()` start/end timings and reject requests exceeding 500 ms for listing or 30 s for prompt testing. Recording durations ensures diagnostics pipeline can raise performance warnings and satisfies constitution quality gates.
- **Alternatives Considered**:
  - Rely solely on Vitest performance tests (rejected: lacks runtime protection when degraded conditions occur).
  - Using global Fastify timeout configuration (rejected: different endpoints need tailored thresholds).
