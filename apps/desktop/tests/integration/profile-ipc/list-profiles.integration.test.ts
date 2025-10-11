import type {
  ListProfilesResponse,
  ProfileIpcChannel,
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedListResponse {
  requestId: string;
  channel: string;
  success: boolean;
  code: string;
  data: ListProfilesResponse | null;
  userMessage: string;
  remediation?: string | null;
  debug?: unknown;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: "available" | "unavailable";
}

describe("Profile IPC integration: list profiles", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Harness not yet implemented; disposal will fail until Phase 3.3.
    } finally {
      harness = null;
    }
  });

  it("returns sanitized profiles with diagnostics under 500ms", async () => {
    harness = await createProfileIpcHarness({
      profileService: {
        list: () => ({
          profiles: [
            {
              id: "a72b3236-3a1c-4673-8aeb-3af9915f0e91",
              name: "Prod",
              providerType: "azure",
              endpointUrl: "https://workspace.contoso.ai",
              isActive: true,
              consentTimestamp: null,
              lastModified: 1_697_000_000_000,
            },
            {
              id: "1aeb1d42-1b99-4894-8e68-12b11232b6e2",
              name: "QA",
              providerType: "openai",
              endpointUrl: "https://api.openai.com/v1",
              isActive: false,
              consentTimestamp: null,
              lastModified: 1_697_100_000_000,
            },
          ],
          diagnostics: [
            {
              profileId: "1aeb1d42-1b99-4894-8e68-12b11232b6e2",
              lastErrorCode: "SERVICE_FAILURE",
              lastErrorAt: 1_697_200_000_000,
            },
          ],
        }),
      },
    });

    const { response, diagnostics, durationMs } = await harness.invoke<ExpectedListResponse>(
      "llmProfile:list" as unknown as ProfileIpcChannel,
      {
      filter: {
        includeDiagnostics: true,
      },
      }
    );

    expect(response.success).toBe(true);
    expect(response.code).toBe("OK");
    expect(response.data?.profiles).toHaveLength(2);
    expect(
      response.data?.profiles?.every((profile: ListProfilesResponse["profiles"][number]) =>
        Object.prototype.hasOwnProperty.call(profile, "apiKey")
      )
    ).toBe(false);
    expect(durationMs).toBeLessThanOrEqual(500);
    expect(response.durationMs).toBeLessThanOrEqual(500);

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          durationMs?: number;
          resultCode?: string;
        }
      | undefined;
    expect(breadcrumb).toBeDefined();
    expect(breadcrumb?.channel).toBe("llmProfile:list");
    expect(breadcrumb?.durationMs).toBeLessThanOrEqual(500);
    expect(breadcrumb?.resultCode).toBe("OK");
  });
});
