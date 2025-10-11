import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LLMProfile } from "@metaverse-systems/llm-tutor-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "../../../src/components/LLMProfiles/ProfileForm";

const fixedNow = new Date("2025-10-10T12:00:00Z").valueOf();

const buildProfile = (overrides: Partial<LLMProfile> = {}): LLMProfile => {
  const base: LLMProfile = {
    id: "profile-1",
    name: "Azure Prod",
    providerType: "azure",
    endpointUrl: "https://workspace.openai.azure.com",
    apiKey: "***REDACTED***",
    modelId: "gpt-4o",
    isActive: true,
    consentTimestamp: fixedNow - 10_000,
    createdAt: fixedNow - 60_000,
    modifiedAt: fixedNow - 5_000
  };

  return { ...base, ...overrides };
};

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submits a local llama.cpp profile via createProfile", async () => {
    const createProfile = vi.fn().mockResolvedValue(
      buildProfile({
        id: "profile-local",
        name: "Local llama.cpp",
        providerType: "llama.cpp",
        endpointUrl: "http://localhost:11434",
        modelId: null,
        consentTimestamp: null
      })
    );

    const updateProfile = vi.fn();
    const onSubmitted = vi.fn();

    render(
      <ProfileForm
        mode="create"
        createProfile={createProfile}
        updateProfile={updateProfile}
        onRequestClose={vi.fn()}
        onSubmitted={onSubmitted}
      />
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Local llama.cpp" } });
    fireEvent.change(screen.getByLabelText(/endpoint url/i), { target: { value: "http://localhost:11434" } });
    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledTimes(1);
    });

    const payload = createProfile.mock.calls[0][0];
    expect(payload).toEqual({
      name: "Local llama.cpp",
      providerType: "llama.cpp",
      endpointUrl: "http://localhost:11434",
      apiKey: "",
      modelId: null,
      consentTimestamp: null
    });

    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: "profile-local", name: "Local llama.cpp" }),
      "created"
    );
  });

  it("allows local profiles without an API key", async () => {
    const createProfile = vi.fn().mockResolvedValue(
      buildProfile({
        id: "profile-local",
        name: "Local llama.cpp",
        providerType: "llama.cpp",
        endpointUrl: "http://localhost:8080",
        apiKey: "",
        modelId: null,
        consentTimestamp: null
      })
    );

    render(
      <ProfileForm
        mode="create"
        createProfile={createProfile}
        updateProfile={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Local llama.cpp" } });
    fireEvent.change(screen.getByLabelText(/endpoint url/i), { target: { value: "http://localhost:8080" } });

    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledWith({
        name: "Local llama.cpp",
        providerType: "llama.cpp",
        endpointUrl: "http://localhost:8080",
        apiKey: "",
        modelId: null,
        consentTimestamp: null
      });
    });
  });

  it("shows validation error when remote provider is missing API key", async () => {
    const createProfile = vi.fn();

    render(
      <ProfileForm
        mode="create"
        createProfile={createProfile}
        updateProfile={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "azure" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Azure workspace" } });
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: "https://my-instance.openai.azure.com" }
    });

    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(screen.getByText(/enter an api key for remote providers/i)).toBeInTheDocument();
    });

    expect(createProfile).not.toHaveBeenCalled();
  });

  it("requires consent for Azure providers", async () => {
    const createProfile = vi.fn();

    render(
      <ProfileForm
        mode="create"
        createProfile={createProfile}
        updateProfile={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "azure" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Azure workspace" } });
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: "https://my-instance.openai.azure.com" }
    });
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "azure-key" } });
    fireEvent.change(screen.getByLabelText(/model \/ deployment/i), { target: { value: "gpt-4o" } });

    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(screen.getByText(/must grant consent/i)).toBeInTheDocument();
    });

    expect(createProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));

    const resolvedProfile = buildProfile({
      id: "profile-azure",
      name: "Azure workspace",
      endpointUrl: "https://my-instance.openai.azure.com",
      modelId: "gpt-4o",
      consentTimestamp: fixedNow
    });
    createProfile.mockResolvedValue(resolvedProfile);

    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(createProfile).toHaveBeenCalledTimes(1);
    });

    const payload = createProfile.mock.calls[0][0];
    expect(payload).toEqual({
      name: "Azure workspace",
      providerType: "azure",
      endpointUrl: "https://my-instance.openai.azure.com",
      apiKey: "azure-key",
      modelId: "gpt-4o",
      consentTimestamp: fixedNow
    });
  });

  it("updates an existing profile via updateProfile", async () => {
    const existingProfile = buildProfile();
    const updateProfile = vi.fn().mockResolvedValue({
      ...existingProfile,
      name: "Azure workspace renamed",
      modifiedAt: fixedNow
    });
    const onSubmitted = vi.fn();

    render(
      <ProfileForm
        mode="edit"
        profile={existingProfile}
        createProfile={vi.fn()}
        updateProfile={updateProfile}
        onRequestClose={vi.fn()}
        onSubmitted={onSubmitted}
      />
    );

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Azure workspace renamed" } });
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "new-azure-key" } });

    fireEvent.submit(screen.getByTestId("profile-form"));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith(
        existingProfile.id,
        expect.objectContaining({
          name: "Azure workspace renamed",
          providerType: "azure",
          endpointUrl: existingProfile.endpointUrl,
          apiKey: "new-azure-key",
          modelId: existingProfile.modelId,
          consentTimestamp: existingProfile.consentTimestamp
        })
      );
    });

    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Azure workspace renamed" }),
      "updated"
    );
  });
});
