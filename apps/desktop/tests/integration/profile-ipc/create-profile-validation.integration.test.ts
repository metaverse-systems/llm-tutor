import type { ProfileIpcChannel } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedValidationResponse {
  requestId: string;
  channel: string;
  success: boolean;
  code: string;
  data: null;
  userMessage: string;
  remediation?: string | null;
  debug?: unknown;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: "available" | "unavailable";
}

describe("Profile IPC integration: create profile validation", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Dispose will fail until implementation is ready.
    } finally {
      harness = null;
    }
  });

  it("returns VALIDATION_ERROR with remediation guidance", async () => {
    harness = await createProfileIpcHarness();

    const { response, diagnostics } = await harness.invoke<ExpectedValidationResponse>(
      "llmProfile:create" as unknown as ProfileIpcChannel,
      {
        profile: {
          name: "",
          providerType: "azure",
          endpointUrl: "invalid-url",
          apiKey: "",
        },
      }
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe("VALIDATION_ERROR");
    expect(response.userMessage.toLowerCase()).toContain("invalid");
    expect(response.remediation).toBeTruthy();
    expect(response.safeStorageStatus).toBe("available");

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          resultCode?: string;
        }
      | undefined;
    expect(breadcrumb?.channel).toBe("llmProfile:create");
    expect(breadcrumb?.resultCode).toBe("VALIDATION_ERROR");
  });
});
