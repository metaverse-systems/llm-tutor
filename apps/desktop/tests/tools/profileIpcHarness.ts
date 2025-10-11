import type { ProfileIpcChannel } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";

export interface ProfileIpcHarnessOptions {
  profileService?: Partial<Record<string, unknown>>;
  testPromptService?: Partial<Record<string, unknown>>;
  autoDiscoveryService?: Partial<Record<string, unknown>>;
  safeStorageAvailable?: boolean;
}

export interface ProfileIpcHarnessInvocation<TResponse = unknown> {
  response: TResponse;
  diagnostics: unknown[];
  durationMs: number;
}

export interface ProfileIpcHarness {
  invoke<TResponse = unknown>(
    channel: ProfileIpcChannel,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<ProfileIpcHarnessInvocation<TResponse>>;
  setSafeStorageAvailability(isAvailable: boolean): void;
  isChannelRegistered(channel: ProfileIpcChannel): boolean;
  diagnostics: {
    events: unknown[];
  };
  dispose(): Promise<void>;
}

export function createProfileIpcHarness(
  _options: ProfileIpcHarnessOptions = {}
): Promise<ProfileIpcHarness> {
  return Promise.reject(
    new Error(
      "Profile IPC test harness is not implemented yet. Complete Phase 3.3 handlers to satisfy integration tests."
    )
  );
}
