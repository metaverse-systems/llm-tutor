import type {
  DiscoverProfileResponse,
  ProfileIpcChannel,
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedDiscoverResponse {
  requestId: string;
  channel: string;
  success: boolean;
  code: string;
  data: DiscoverProfileResponse | null;
  userMessage: string;
  remediation?: string | null;
  debug?: unknown;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: "available" | "unavailable";
}

describe("Profile IPC integration: discover providers", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Implementation not ready yet.
    } finally {
      harness = null;
    }
  });

  it("deduplicates providers and surfaces DISCOVERY_CONFLICT when duplicates found", async () => {
    harness = await createProfileIpcHarness({
      autoDiscoveryService: {
        discover: () => ({
          providers: [
            {
              providerType: "azure",
              endpointUrl: "https://workspace.contoso.ai",
              latencyMs: 210,
              requiresConsent: true,
            },
            {
              providerType: "azure",
              endpointUrl: "https://workspace.contoso.ai",
              latencyMs: 220,
              requiresConsent: true,
            },
          ],
        }),
      },
    });

    const { response, diagnostics } = await harness.invoke<ExpectedDiscoverResponse>(
      "llmProfile:discover" as unknown as ProfileIpcChannel,
      {
        scope: {
          strategy: "remote",
          timeoutMs: 1500,
          includeExisting: true,
        },
      }
    );

    expect(response.success).toBe(false);
    expect(response.code).toBe("DISCOVERY_CONFLICT");
    expect(response.userMessage.toLowerCase()).toContain("duplicate");
    expect(response.remediation).toMatch(/resolve/i);

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          resultCode?: string;
          metadata?: Record<string, unknown>;
        }
      | undefined;
    expect(breadcrumb?.channel).toBe("llmProfile:discover");
    expect(breadcrumb?.resultCode).toBe("DISCOVERY_CONFLICT");
    expect(breadcrumb?.metadata).toMatchObject({ duplicateCount: 1 });
  });
});
