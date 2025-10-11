# Performance Benchmarks

This directory hosts the Vitest-based profiling harness for LLM profile management.

## What it covers
- `profile-crud.perf.test.ts` seeds an in-memory vault with 100 profiles and measures p95 latency for list, create, update, and delete paths in `ProfileService`.
- Thresholds are derived from the performance goals documented in `specs/007-llm-connection-management/plan.md`.
- Each run logs the observed p95 latencies to standard output so CI artifacts capture real numbers alongside the assertions.

## How to run it
```bash
npm --workspace @metaverse-systems/llm-tutor-backend run test:perf
```

The command keeps the suite isolated from the default `npm run test` workflow, allowing developers to spot performance regressions on demand without slowing down the day-to-day unit test loop.
