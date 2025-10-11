import type {
  ProfileIpcChannel,
  TestProfileResponse,
} from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { afterEach, describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";
import type { ProfileIpcHarness } from "../../tools/profileIpcHarness";

interface ExpectedTestResponse {
  requestId: string;
  channel: string;
  success: boolean;
  code: string;
  data: TestProfileResponse | null;
  userMessage: string;
  remediation?: string | null;
  debug?: unknown;
  correlationId: string;
  durationMs: number;
  safeStorageStatus: "available" | "unavailable";
}

describe("Profile IPC integration: test prompt telemetry", () => {
  let harness: ProfileIpcHarness | null = null;

  afterEach(async () => {
    if (!harness) {
      return;
    }
    try {
      await harness.dispose();
    } catch {
      // Implementation pending.
    } finally {
      harness = null;
    }
  });

  it("records latency breakdown and diagnostics for test prompt", async () => {
    harness = await createProfileIpcHarness({
      testPromptService: {
        execute: () => ({
          profileId: "acf1dd92-750a-4dfb-9e52-cd430b5f30c9",
          success: true,
          latencyMs: 320,
          totalTimeMs: 380,
          modelName: "gpt-4o-mini",
          truncatedResponse: "Hello, learner!",
        }),
      },
    });

    const { response, diagnostics } = await harness.invoke<ExpectedTestResponse>(
      "llmProfile:test" as unknown as ProfileIpcChannel,
      {
        profileId: "acf1dd92-750a-4dfb-9e52-cd430b5f30c9",
        promptOverride: "Summarize today's lesson",
      }
    );

    expect(response.success).toBe(true);
    expect(response.code).toBe("OK");
    expect(response.data?.latencyMs).toBe(320);
    expect(response.data?.totalTimeMs).toBeGreaterThanOrEqual(380);
    expect(response.durationMs).toBeLessThanOrEqual(500);

    const breadcrumb = diagnostics.at(-1) as
      | {
          channel?: string;
          metadata?: Record<string, unknown>;
        }
      | undefined;
    expect(breadcrumb?.channel).toBe("llmProfile:test");
    expect(breadcrumb?.metadata).toMatchObject({ latencyMs: 320, totalTimeMs: 380 });
  });
});
