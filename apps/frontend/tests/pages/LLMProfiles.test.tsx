import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LLMProfile, TestPromptResult } from "@metaverse-systems/llm-tutor-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LLMProfiles } from "../../src/pages/settings/LLMProfiles";
import { useLLMProfiles } from "../../src/hooks/useLLMProfiles";
import type { UseLLMProfilesResult } from "../../src/hooks/useLLMProfiles";
import type { DiscoveryResult } from "../../src/types/llm-api";

vi.mock("../../src/hooks/useLLMProfiles");

const buildProfile = (overrides?: Partial<LLMProfile>): LLMProfile => {
  const now = Date.now();
  return {
    id: "profile-1",
    name: "Local llama.cpp",
    providerType: "llama.cpp",
    endpointUrl: "http://localhost:8080",
    apiKey: "***REDACTED***",
    modelId: null,
    isActive: true,
    consentTimestamp: null,
    createdAt: now,
    modifiedAt: now,
    ...overrides
  };
};

const baseTestPrompt: TestPromptResult = {
  profileId: "profile-1",
  profileName: "Local llama.cpp",
  providerType: "llama.cpp",
  success: true,
  promptText: "Hello",
  responseText: "Hello world",
  modelName: "llama-2",
  latencyMs: 240,
  totalTimeMs: 260,
  errorCode: null,
  errorMessage: null,
  timestamp: Date.now()
};

const discoveryIdle: DiscoveryResult = {
  discovered: false,
  discoveredUrl: null,
  profileCreated: false,
  profileId: null,
  probedPorts: []
};

const asMock = vi.mocked(useLLMProfiles);

const buildHookResult = (overrides?: Partial<UseLLMProfilesResult>): UseLLMProfilesResult => {
  return {
    profiles: [],
    activeProfile: null,
    loading: false,
    error: null,
    encryptionAvailable: false,
    fetchProfiles: vi.fn().mockResolvedValue(undefined),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    activateProfile: vi.fn().mockResolvedValue(undefined),
    testPrompt: vi.fn().mockResolvedValue(baseTestPrompt),
    discoverProfiles: vi.fn().mockResolvedValue(discoveryIdle),
    ...overrides
  };
};

describe("LLMProfiles page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { llmTutor?: unknown }).llmTutor = undefined;
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { llmTutor?: unknown }).llmTutor = undefined;
  });

  it("shows loading skeleton while profiles are loading", () => {
    asMock.mockReturnValue(buildHookResult({ loading: true }));

    render(<LLMProfiles />);

    expect(screen.getByRole("status", { name: /loading profiles/i })).toBeInTheDocument();
  });

  it("renders profile cards with badges and metadata", () => {
    const profile = buildProfile({
      id: "profile-a",
      name: "Azure Prod",
      providerType: "azure",
      endpointUrl: "https://workspace.openai.azure.com",
      modelId: "gpt-4o",
      isActive: false,
      consentTimestamp: Date.now()
    });

    asMock.mockReturnValue(
      buildHookResult({
        profiles: [profile, buildProfile({ id: "profile-b", name: "Local" })],
        encryptionAvailable: true
      })
    );

    render(<LLMProfiles />);

    expect(screen.getByText("Azure Prod")).toBeInTheDocument();
    expect(screen.getByText("Azure OpenAI")).toBeInTheDocument();
    expect(screen.getAllByText("Encrypted").length).toBeGreaterThan(0);
    expect(screen.getByText("workspace.openai.azure.com")).toBeInTheDocument();
  });

  it("activates a profile when the activate button is pressed", async () => {
    const activateProfile = vi.fn().mockResolvedValue(undefined);
    const profile = buildProfile({ id: "profile-b", isActive: false, name: "Local Dev" });

    asMock.mockReturnValue(
      buildHookResult({ profiles: [buildProfile(), profile], activateProfile })
    );

    render(<LLMProfiles />);

    const activateButton = screen.getByRole("button", { name: "Activate" });
    fireEvent.click(activateButton);

    await waitFor(() => {
      expect(activateProfile).toHaveBeenCalledWith(profile.id);
    });
  });

  it("runs a connection test and surfaces the response", async () => {
    const testPrompt = vi.fn().mockResolvedValue({
      ...baseTestPrompt,
      profileId: "profile-b",
      profileName: "Azure Prod",
      responseText: "Connection ok",
      latencyMs: 312
    });

    const profile = buildProfile({ id: "profile-b", name: "Azure Prod", isActive: false, providerType: "azure" });

    asMock.mockReturnValue(
      buildHookResult({ profiles: [profile], testPrompt })
    );

    render(<LLMProfiles />);

    const testButton = screen.getByTestId(`test-connection-${profile.id}`);
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(testPrompt).toHaveBeenCalledWith(profile.id);
    });

    await waitFor(() => {
      expect(screen.getByText(/connection ok/i)).toBeInTheDocument();
      expect(screen.getByText(/Latency: 312 ms/)).toBeInTheDocument();
    });
  });

  it("confirms deletion via keyboard shortcut", async () => {
    const deleteProfile = vi.fn().mockResolvedValue(undefined);
    const profile = buildProfile({ id: "profile-delete", isActive: false, name: "Temp" });

    asMock.mockReturnValue(
      buildHookResult({ profiles: [profile], deleteProfile })
    );

    render(<LLMProfiles />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.keyDown(deleteButton, { key: "Delete" });

    const dialog = await screen.findByTestId("delete-confirm-dialog");
    const dialogDeleteButton = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(dialogDeleteButton);

    await waitFor(() => {
      expect(deleteProfile).toHaveBeenCalledWith(profile.id, undefined);
    });
  });

  it("requires selecting an alternate profile before deleting the active profile", async () => {
    const deleteProfile = vi.fn().mockResolvedValue(undefined);
    const activeProfile = buildProfile({ id: "profile-active", name: "Primary", isActive: true });
    const alternateProfile = buildProfile({ id: "profile-alt", name: "Backup", isActive: false });

    asMock.mockReturnValue(
      buildHookResult({ profiles: [activeProfile, alternateProfile], deleteProfile })
    );

    render(<LLMProfiles />);

    const deleteButton = screen.getAllByRole("button", { name: "Delete" })[0];
    fireEvent.click(deleteButton);

    const dialog = await screen.findByTestId("delete-confirm-dialog");
    const select = within(dialog).getByLabelText(/choose a profile to activate/i) as HTMLSelectElement;
    expect(select.value).toBe(alternateProfile.id);

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteProfile).toHaveBeenCalledWith(activeProfile.id, alternateProfile.id);
    });
  });

  it("runs auto-discovery when requested", async () => {
    const discoverProfiles = vi.fn().mockResolvedValue({
      discovered: true,
      discoveredUrl: "http://localhost:8080",
      profileCreated: true,
      profileId: "profile-1",
      probedPorts: [8080]
    } satisfies DiscoveryResult);

    asMock.mockReturnValue(
      buildHookResult({ discoverProfiles })
    );

    render(<LLMProfiles />);

    const button = screen.getByRole("button", { name: "Run auto-discovery" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(discoverProfiles).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId("discovery-status")).toHaveTextContent(/Discovered llama.cpp/i);
    });
  });

  it("prompts for consent before creating a remote provider profile", async () => {
    const getState = vi.fn().mockResolvedValue({
      preferences: { remoteProvidersEnabled: false },
      latestSnapshot: null
    });
    const updatePreferences = vi.fn().mockResolvedValue(undefined);

    (window as unknown as { llmTutor?: { diagnostics?: unknown } }).llmTutor = {
      diagnostics: { getState, updatePreferences }
    };

    const createProfile = vi.fn().mockResolvedValue(
      buildProfile({ id: "profile-remote", providerType: "azure", consentTimestamp: Date.now(), name: "Azure" })
    );

    asMock.mockReturnValue(
      buildHookResult({
        profiles: [],
        createProfile
      })
    );

    render(<LLMProfiles />);

  fireEvent.click(screen.getByTestId("add-remote-provider-button"));

    expect(await screen.findByTestId("consent-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("consent-accept-button"));

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalled();
    });

    const form = await screen.findByTestId("profile-form-dialog");
    expect(form).toBeInTheDocument();

    const providerSelect = screen.getByLabelText("Provider *") as HTMLSelectElement;
    expect(providerSelect.value).toBe("azure");
  });

  it("restores focus and skips profile creation when consent is declined", async () => {
    const updatePreferences = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { llmTutor?: { diagnostics?: unknown } }).llmTutor = {
      diagnostics: { updatePreferences }
    };

    asMock.mockReturnValue(buildHookResult());

    render(<LLMProfiles />);

  const remoteButton = screen.getByTestId("add-remote-provider-button");
    remoteButton.focus();

    fireEvent.click(remoteButton);

    const dialog = await screen.findByTestId("consent-dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("consent-cancel-button"));

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("profile-form-dialog")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(remoteButton);
    });
  });
});
