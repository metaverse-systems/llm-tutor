# Phase 0 Research – Persistent Diagnostics Preference Vault

## Decision Log

### Preference vault ownership & locking
- **Decision**: Host the `electron-store` instance exclusively in the Electron main process with a dedicated `preferencesVault` module that serialises writes via a queue and exposes synchronous bootstrap reads.
- **Rationale**: Centralising access avoids race conditions between renderer, preload, and backend processes, keeps file locking predictable across platforms, and lets us inject logging/fallback behaviour before any mutation reaches disk.
- **Alternatives considered**:
  - **Renderer-managed store**: Simplifies UI code but prevents backend/export access and risks concurrent writes once multiple windows exist.
  - **Custom JSON file with fs.promises**: Allows fine-grained control but re-implements durability, validation, and migration mechanics that `electron-store` already provides safely.

### Cross-process sync strategy
- **Decision**: Main process emits a typed `diagnostics:preferences:updated` IPC broadcast after every vault mutation and honours idempotent `diagnostics:preferences:update` requests from renderer/preload, while the backend polls via Fastify route wrappers triggered through Electron-managed HTTP calls.
- **Rationale**: Keeps renderer responsive with push updates, maintains clear ownership boundaries, and lets backend snapshots request the latest state without tightly coupling to Electron internals.
- **Alternatives considered**:
  - **Polling from renderer**: Simpler but introduces delay, additional disk reads, and increases power usage.
  - **Shared memory module**: Faster but unnecessary for the small payload size and complicates Windows support.

### Storage failure messaging & fallback
- **Decision**: When vault writes fail (permission denied, disk full, corruption), display an accessible toast and modal explaining that settings will apply for the current session only, log a `StorageHealthAlert` entry, and surface remediation steps in the diagnostics panel.
- **Rationale**: Preserves learner control, avoids silent data loss, and satisfies constitutional transparency requirements while staying within offline constraints.
- **Alternatives considered**:
  - **Hard failure**: Blocking UI changes on write failure would undermine accessibility and frustrate learners.
  - **Silent fallback**: Would obscure issues from support staff and violate transparency expectations.

### Consent event retention window
- **Decision**: Record the latest consent state plus the three most recent `ConsentEventLog` entries in the vault and replicate them into diagnostics exports for long-term history.
- **Rationale**: Limits on-device storage while ensuring exports provide an auditable trail of opt-in/opt-out decisions for support. Additional history lives in immutable JSONL exports already mandated by diagnostics requirements.
- **Alternatives considered**:
  - **Unlimited history in the vault**: Risks unbounded growth and potential privacy concerns if the vault is ever shared accidentally.
  - **No event history**: Would make troubleshooting consent changes impossible.

### Development harness backend orchestration
- **Decision**: Update the desktop dev script to spawn the backend only when it is not already running, using a lock file + port probe, and emit guidance to terminate conflicting processes instead of auto-restarting repeatedly.
- **Rationale**: Eliminates current EADDRINUSE errors, keeps logs readable, and mirrors production behaviour where Electron owns the backend lifecycle.
- **Alternatives considered**:
  - **Always kill existing backend**: Risky during debugging if the developer intentionally runs an independent instance.
  - **Leave duplication unresolved**: Maintains current friction and violates the spec requirement to let Electron own the backend in dev mode.

## Follow-ups Outside This Feature
- Explore encrypting the preference vault once we introduce multi-user support or sensitive tutor settings.
- Evaluate moving diagnostics preference schema into a versioned migration framework if future features add nested settings.
