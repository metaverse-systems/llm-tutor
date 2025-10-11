import type { ProfileIpcChannel } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { describe, expect, it } from "vitest";

import { createProfileIpcHarness } from "../../tools/profileIpcHarness";

const CHANNELS: ProfileIpcChannel[] = [
  "llmProfile:list",
  "llmProfile:create",
  "llmProfile:update",
  "llmProfile:delete",
  "llmProfile:activate",
  "llmProfile:test",
  "llmProfile:discover",
].map((channel) => channel as unknown as ProfileIpcChannel);

describe("Profile IPC integration: dispose lifecycle", () => {
  it("unregisters all channels on dispose", async () => {
    const harness = await createProfileIpcHarness();

    for (const channel of CHANNELS) {
      expect(harness.isChannelRegistered(channel)).toBe(true);
    }

    await harness.dispose();

    for (const channel of CHANNELS) {
      expect(harness.isChannelRegistered(channel)).toBe(false);
    }
  });
});
