import { describe, it, expect } from "vitest";

const SCRIPT_PATH = "../../scripts/export-diagnostics.cjs";

describe("export automation CLI", () => {
  it("exposes a runAutomation entry point", async () => {
    await expect(import(SCRIPT_PATH)).resolves.toMatchObject({
      runAutomation: expect.any(Function)
    });
  });

  it("enforces offline defaults when running without explicit network opts", async () => {
    const module = await import(SCRIPT_PATH);
    const runAutomation = module.runAutomation as unknown as (
      options?: { env?: Record<string, string | undefined> }
    ) => Promise<{ exitCode: number; env: Record<string, string> }>;

    const result = await runAutomation({});

    expect(result.env).toMatchObject({
      PLAYWRIGHT_HEADLESS: "1",
      PLAYWRIGHT_OFFLINE: "1",
      LLM_TUTOR_REMOTE_DEBUG_PORT: expect.any(String)
    });
    expect(result.exitCode).toBe(0);
  });
});
