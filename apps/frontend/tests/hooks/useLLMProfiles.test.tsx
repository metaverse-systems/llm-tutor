import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { useLLMProfiles } from "../../src/hooks/useLLMProfiles";
import type {
  CreateProfileResult,
  DiscoveryResult,
  ErrorResponse,
  InvokeResult,
  ListProfilesResult,
  LlmApiBridge,
  SuccessResponse
} from "../../src/types/llm-api";
import type { LLMProfile } from "@metaverse-systems/llm-tutor-shared";

type AsyncInvokeMock = ReturnType<typeof vi.fn>;

interface BridgeMocks {
  listProfiles: AsyncInvokeMock;
  createProfile: AsyncInvokeMock;
  updateProfile: AsyncInvokeMock;
  deleteProfile: AsyncInvokeMock;
  activateProfile: AsyncInvokeMock;
  testPrompt: AsyncInvokeMock;
  discoverProfiles: AsyncInvokeMock;
}

interface BridgeHarness {
  bridge: LlmApiBridge;
  mocks: BridgeMocks;
}

function success<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: Date.now()
  };
}

function failure(error: string, message?: string, details?: unknown): ErrorResponse {
  return {
    error,
    message: message ?? error,
    timestamp: Date.now(),
    details
  };
}

function buildProfile(overrides?: Partial<LLMProfile>): LLMProfile {
  const now = Date.now();
  const base: LLMProfile = {
    id: "profile-1",
    name: "Local llama",
    providerType: "llama.cpp",
    endpointUrl: "http://localhost:8080",
    apiKey: "***REDACTED***",
    modelId: null,
    isActive: true,
    consentTimestamp: null,
    createdAt: now,
    modifiedAt: now
  };

  return { ...base, ...overrides };
}

function createBridgeHarness(): BridgeHarness {
  const mocks: BridgeMocks = {
    listProfiles: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    activateProfile: vi.fn(),
    testPrompt: vi.fn(),
    discoverProfiles: vi.fn()
  };

  const bridge: LlmApiBridge = {
    listProfiles: () => mocks.listProfiles(),
    createProfile: (payload) => mocks.createProfile(payload),
    updateProfile: (payload) => mocks.updateProfile(payload),
    deleteProfile: (payload) => mocks.deleteProfile(payload),
    activateProfile: (payload) => mocks.activateProfile(payload),
    testPrompt: (payload) => mocks.testPrompt(payload),
    discoverProfiles: (payload) => mocks.discoverProfiles(payload)
  };

  return { bridge, mocks };
}

const globalWindow = window as typeof window & { llmAPI?: LlmApiBridge };

describe("useLLMProfiles", () => {
  let harness: BridgeHarness;

  beforeEach(() => {
    harness = createBridgeHarness();
    globalWindow.llmAPI = harness.bridge;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete globalWindow.llmAPI;
  });

  it("loads initial profiles on mount", async () => {
    const profile = buildProfile({ id: "profile-a" });
    const listResult: ListProfilesResult = {
      profiles: [profile],
      encryptionAvailable: true,
      activeProfileId: profile.id
    };

    harness.mocks.listProfiles.mockResolvedValue(success(listResult));

    const { result } = renderHook(() => useLLMProfiles());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.profiles[0]?.id).toBe(profile.id);
    expect(result.current.activeProfile?.id).toBe(profile.id);
    expect(result.current.encryptionAvailable).toBe(true);
    expect(result.current.error).toBeNull();
    expect(harness.mocks.listProfiles).toHaveBeenCalledTimes(1);
  });

  it("performs optimistic create and revalidates state", async () => {
    const existing = buildProfile({ id: "profile-base", isActive: true });
    const createdProfile = buildProfile({
      id: "profile-created",
      name: "Azure Production",
      providerType: "azure",
      endpointUrl: "https://workspace.openai.azure.com",
      modelId: "gpt-4o",
      isActive: false,
      consentTimestamp: Date.now()
    });

    harness.mocks.listProfiles
      .mockResolvedValueOnce(
        success({ profiles: [existing], encryptionAvailable: true, activeProfileId: existing.id })
      )
      .mockResolvedValueOnce(
        success({
          profiles: [existing, createdProfile],
          encryptionAvailable: true,
          activeProfileId: existing.id
        })
      );

    let resolveCreate: ((value: InvokeResult<CreateProfileResult>) => void) | undefined;
    harness.mocks.createProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { result } = renderHook(() => useLLMProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let createPromise: Promise<LLMProfile>;
    await act(async () => {
      createPromise = result.current.createProfile({
        name: createdProfile.name,
        providerType: createdProfile.providerType,
        endpointUrl: createdProfile.endpointUrl,
        apiKey: "sk-test",
        modelId: createdProfile.modelId,
        consentTimestamp: createdProfile.consentTimestamp ?? null
      });
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.profiles.some((profile) => profile.name === createdProfile.name)).toBe(true);

    resolveCreate?.(success({ profile: createdProfile }));

    await act(async () => {
      await createPromise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(harness.mocks.listProfiles).toHaveBeenCalledTimes(2);
    expect(result.current.profiles.some((profile) => profile.id === createdProfile.id)).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("rolls back optimistic state when create fails", async () => {
    const existing = buildProfile({ id: "profile-original" });
    harness.mocks.listProfiles.mockResolvedValue(success({
      profiles: [existing],
      encryptionAvailable: false,
      activeProfileId: existing.id
    }));

    harness.mocks.createProfile.mockResolvedValue(
      failure("VALIDATION_ERROR", "Duplicate profile name")
    );

    const { result } = renderHook(() => useLLMProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.createProfile({
          name: "Duplicate",
          providerType: "llama.cpp",
          endpointUrl: "http://localhost:8080",
          apiKey: "sk-dupe",
          modelId: null,
          consentTimestamp: null
        })
      ).rejects.toThrowError("Duplicate profile name");
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.profiles[0]?.id).toBe(existing.id);
    await waitFor(() => expect(result.current.error).toBe("Duplicate profile name"));
  });

  it("invokes discovery and refreshes profiles", async () => {
    const before = buildProfile({ id: "profile-before" });
    const after = buildProfile({ id: "profile-after", isActive: true });

    harness.mocks.listProfiles
      .mockResolvedValueOnce(
        success({ profiles: [before], encryptionAvailable: true, activeProfileId: before.id })
      )
      .mockResolvedValueOnce(
        success({ profiles: [before, after], encryptionAvailable: true, activeProfileId: after.id })
      );

    const discoveryResult: DiscoveryResult = {
      discovered: true,
      discoveredUrl: "http://localhost:11434",
      profileCreated: true,
      profileId: after.id,
      probedPorts: [8080, 8000, 11434]
    };

    harness.mocks.discoverProfiles.mockResolvedValue(success(discoveryResult));

    const { result } = renderHook(() => useLLMProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const response = await act(async () => result.current.discoverProfiles(true));
    expect(response).toEqual(discoveryResult);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(harness.mocks.listProfiles).toHaveBeenCalledTimes(2);
    expect(result.current.profiles.some((profile) => profile.id === after.id)).toBe(true);
  });

  it("surfaces test prompt errors", async () => {
    const existing = buildProfile({ id: "profile-error" });
    harness.mocks.listProfiles.mockResolvedValue(success({
      profiles: [existing],
      encryptionAvailable: true,
      activeProfileId: existing.id
    }));
    harness.mocks.testPrompt.mockResolvedValue(
      failure("NO_ACTIVE_PROFILE", "No active profile available")
    );

    const { result } = renderHook(() => useLLMProfiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.testPrompt()).rejects.toThrowError("No active profile available");
    });

    await waitFor(() => expect(result.current.error).toBe("No active profile available"));
  });

  it("handles missing bridge gracefully", async () => {
    delete globalWindow.llmAPI;

    const { result } = renderHook(() => useLLMProfiles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("LLM bridge unavailable");
  });
});
