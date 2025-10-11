# Quickstart: Backend LLM Profile Operations

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run backend contract tests**
   ```bash
   npm run test:contract --workspace @metaverse-systems/llm-tutor-backend
   ```
3. **Run backend integration tests**
   ```bash
   npm run test:integration --workspace @metaverse-systems/llm-tutor-backend
   ```
4. **Execute profile regression suite**
   ```bash
   npm run test --workspace @metaverse-systems/llm-tutor-backend -- tests/integration/llm/profile-crud.test.ts
   ```
5. **Tail diagnostics during manual testing**
   ```bash
   tail -f $(npm run --silent path:diagnostics-log)
   ```
6. **Launch backend with discovery endpoint enabled**
   ```bash
   DIAGNOSTICS_PORT=4319 LLM_TUTOR_LLM_ENDPOINT=http://localhost:11434 npm run start --workspace @metaverse-systems/llm-tutor-backend
   ```
7. **Verify prompt timeout handling**: trigger `llm:profiles:test` against a stalled provider and confirm response reports timeout after 30 s with diagnostics correlation ID.
