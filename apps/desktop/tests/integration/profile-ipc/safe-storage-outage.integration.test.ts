import type { ProfileIpcChannel } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedBlockedResponse {
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

describe("Profile IPC integration: safeStorage outage", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Ignore until implementation exists.
    } finally {
      harness = null;
    }
  });

  it("blocks create operations and logs outage diagnostics", async () => {
    harness = await createProfileIpcHarness({
      safeStorageAvailable: false,
      profileService: {
        create: () => {
          throw new Error("Writes should be blocked during outage");
        },
      },
    });

    const { response, diagnostics } = await harness.invoke<ExpectedBlockedResponse>(
      "llmProfile:create" as unknown as ProfileIpcChannel,
      {
        profile: {
          name: "Prod",
          providerType: "azure",
          endpointUrl: "https://workspace.contoso.ai",
          apiKey: "sk-blocked",
        },
      }
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe("SAFE_STORAGE_UNAVAILABLE");
    expect(response.safeStorageStatus).toBe("unavailable");
    expect(response.remediation).toMatch(/unlock|restore/i);

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          resultCode?: string;
          metadata?: Record<string, unknown>;
        }
      | undefined;
    expect(breadcrumb?.channel).toBe("llmProfile:create");
    expect(breadcrumb?.resultCode).toBe("SAFE_STORAGE_UNAVAILABLE");
    expect(breadcrumb?.metadata).toMatchObject({ outageActive: true, blockedWrite: true });
  });
});
