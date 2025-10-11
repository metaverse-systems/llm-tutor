import type {
  CreateProfileResponse,
  DraftProfile,
  ProfileIpcChannel,
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedCreateResponse {
  requestId: string;
  channel: string;
  success: boolean;
  code: string;
  data: CreateProfileResponse | null;
  userMessage: string;
  remediation?: string | null;
  debug?: unknown;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: "available" | "unavailable";
}

describe("Profile IPC integration: create profile", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Dispose will fail until implementation lands.
    } finally {
      harness = null;
    }
  });

  it("sanitizes response fields and records diagnostics", async () => {
    const draftProfile: DraftProfile = {
      name: "LLM Tutor QA",
      providerType: "openai",
      endpointUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-qa",
      modelId: "gpt-4o-mini",
      consentTimestamp: null,
    };

    harness = await createProfileIpcHarness({
      profileService: {
        create: (_payload: unknown) => ({
          profile: {
            id: "384a827c-943c-4f3d-a034-8ee8e2385e8a",
            name: draftProfile.name,
            providerType: draftProfile.providerType,
            endpointUrl: draftProfile.endpointUrl,
            isActive: false,
            consentTimestamp: draftProfile.consentTimestamp ?? null,
            lastModified: 1_697_500_000_000,
          },
        }),
      },
    });

    const { response, diagnostics } = await harness.invoke<ExpectedCreateResponse>(
      "llmProfile:create" as unknown as ProfileIpcChannel,
      {
        profile: draftProfile,
      }
    );

    expect(response.success).toBe(true);
    expect(response.code).toBe("OK");
    expect(response.data?.profile).toMatchObject({
      name: draftProfile.name,
      providerType: draftProfile.providerType,
      endpointUrl: draftProfile.endpointUrl,
    });
    expect(
      Object.prototype.hasOwnProperty.call(response.data?.profile ?? {}, "apiKey")
    ).toBe(false);
    expect(response.safeStorageStatus).toBe("available");

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          metadata?: Record<string, unknown>;
          resultCode?: string;
        }
      | undefined;
    expect(breadcrumb?.channel).toBe("llmProfile:create");
    expect(breadcrumb?.resultCode).toBe("OK");
    expect(breadcrumb?.metadata).toMatchObject({ sanitized: true });
  });
});
