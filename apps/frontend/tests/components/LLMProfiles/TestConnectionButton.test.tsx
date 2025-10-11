import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LLMProfile, TestPromptResult } from "@metaverse-systems/llm-tutor-shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestConnectionButton } from "../../../src/components/LLMProfiles/TestConnectionButton";

describe("TestConnectionButton", () => {
  const profile: LLMProfile = {
    id: "profile-1",
    name: "Local llama.cpp",
    providerType: "llama.cpp",
    endpointUrl: "http://localhost:8080",
    apiKey: "***REDACTED***",
    modelId: null,
    isActive: true,
    consentTimestamp: null,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };

  const successfulResult: TestPromptResult = {
    profileId: profile.id,
    profileName: profile.name,
    providerType: profile.providerType,
    success: true,
    promptText: "Hello",
    responseText: "Test response",
    modelName: "llama-2",
    latencyMs: 150,
    totalTimeMs: 180,
    errorCode: null,
    errorMessage: null,
    timestamp: Date.now()
  };

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("triggers a test prompt when clicked", async () => {
    const testPrompt = vi.fn().mockResolvedValue(successfulResult);
    const announce = vi.fn();

    render(<TestConnectionButton profile={profile} testPrompt={testPrompt} announce={announce} />);

    const button = screen.getByTestId(`test-connection-${profile.id}`);
    expect(button).toHaveTextContent("Test connection");

    fireEvent.click(button);

    await waitFor(() => {
      expect(testPrompt).toHaveBeenCalledWith(profile.id);
    });

    await screen.findByTestId("test-connection-success");
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("Connection succeeded"));
  });

  it("shows a spinner while the test is running and renders success state", async () => {
    let resolveTest: (value: TestPromptResult) => void = () => {};
    const testPrompt = vi.fn().mockImplementation(() =>
      new Promise<TestPromptResult>((resolve) => {
        resolveTest = resolve;
      })
    );

    render(<TestConnectionButton profile={profile} testPrompt={testPrompt} />);

    fireEvent.click(screen.getByTestId(`test-connection-${profile.id}`));

    expect(await screen.findByTestId("test-connection-spinner")).toBeInTheDocument();

    resolveTest({
      ...successfulResult,
      latencyMs: 240,
      responseText: "Connection ready"
    });

    const success = await screen.findByTestId("test-connection-success");
    expect(success).toHaveTextContent("Connected (240 ms)");
    expect(await screen.findByTestId("test-connection-preview")).toHaveTextContent("Connection ready");
  });

  it("truncates long response previews", async () => {
    const longResponse = "x".repeat(150);
    const testPrompt = vi.fn().mockResolvedValue({
      ...successfulResult,
      responseText: longResponse,
      latencyMs: 980
    });

    render(<TestConnectionButton profile={profile} testPrompt={testPrompt} />);

    fireEvent.click(screen.getByTestId(`test-connection-${profile.id}`));

    const preview = await screen.findByTestId("test-connection-preview");
    expect(preview.textContent).toHaveLength(101);
    expect(preview).toHaveTextContent(/x{100}…/);
  });

  it("shows an error message if the test prompt rejects", async () => {
    const testPrompt = vi.fn().mockRejectedValue(new Error("Invalid credentials"));

    render(<TestConnectionButton profile={profile} testPrompt={testPrompt} />);

    fireEvent.click(screen.getByTestId(`test-connection-${profile.id}`));

    const error = await screen.findByTestId("test-connection-error");
    expect(error).toHaveTextContent("Invalid credentials");
  });

  it("emits a timeout message after 10 seconds", async () => {
    const testPrompt = vi.fn().mockImplementation(() => new Promise<TestPromptResult>(() => {}));

    render(<TestConnectionButton profile={profile} testPrompt={testPrompt} timeoutMs={50} />);

    fireEvent.click(screen.getByTestId(`test-connection-${profile.id}`));

    const error = await screen.findByTestId("test-connection-error");
    expect(error).toHaveTextContent("Connection test timed out after 50 ms");
  });
});
