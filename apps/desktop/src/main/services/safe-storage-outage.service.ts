import { SafeStorageOutageStateSchema, type SafeStorageOutageState, type SafeStorageStatus } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";

export interface SafeStorageOutageServiceOptions {
  now?: () => number;
  initialState?: Partial<SafeStorageOutageState>;
}

type StateListener = (state: SafeStorageOutageState) => void;

const DEFAULT_STATE: SafeStorageOutageState = SafeStorageOutageStateSchema.parse({
  isActive: false,
  startedAt: null,
  resolvedAt: null,
  blockedRequestIds: []
});

function cloneState(state: SafeStorageOutageState): SafeStorageOutageState {
  return {
    isActive: state.isActive,
    startedAt: state.startedAt ?? null,
    resolvedAt: state.resolvedAt ?? null,
    blockedRequestIds: [...state.blockedRequestIds]
  };
}

export class SafeStorageOutageService {
  private state: SafeStorageOutageState;
  private readonly listeners = new Set<StateListener>();
  private readonly now: () => number;

  constructor(options: SafeStorageOutageServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    const initial = {
      ...DEFAULT_STATE,
      ...options.initialState
    } satisfies SafeStorageOutageState;
    this.state = SafeStorageOutageStateSchema.parse(initial);
  }

  getState(): SafeStorageOutageState {
    return cloneState(this.state);
  }

  getStatus(): SafeStorageStatus {
    return this.state.isActive ? "unavailable" : "available";
  }

  isOutageActive(): boolean {
    return this.state.isActive;
  }

  setAvailability(isAvailable: boolean): SafeStorageOutageState {
    if (isAvailable && !this.state.isActive) {
      return this.state;
    }

    if (!isAvailable && this.state.isActive) {
      return this.state;
    }

    const timestamp = this.now();
    const nextState: SafeStorageOutageState = SafeStorageOutageStateSchema.parse(
      isAvailable
        ? {
            ...this.state,
            isActive: false,
            resolvedAt: timestamp,
            blockedRequestIds: []
          }
        : {
            isActive: true,
            startedAt: timestamp,
            resolvedAt: null,
            blockedRequestIds: []
          }
    );

    this.updateState(nextState);
    return this.state;
  }

  startOutage(): SafeStorageOutageState {
    return this.setAvailability(false);
  }

  resolveOutage(): SafeStorageOutageState {
    return this.setAvailability(true);
  }

  recordBlockedRequest(requestId: string): SafeStorageOutageState {
    if (!this.state.isActive || typeof requestId !== "string" || requestId.trim().length === 0) {
      return this.state;
    }

    if (this.state.blockedRequestIds.includes(requestId)) {
      return this.state;
    }

    const nextState = SafeStorageOutageStateSchema.parse({
      ...this.state,
      blockedRequestIds: [...this.state.blockedRequestIds, requestId]
    });
    this.updateState(nextState);
    return this.state;
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(next: SafeStorageOutageState): void {
    this.state = SafeStorageOutageStateSchema.parse(next);
    for (const listener of this.listeners) {
      try {
        listener(cloneState(this.state));
      } catch {
        // Listener failures should not break outage tracking.
      }
    }
  }
}
