import { expect, test } from "@playwright/test";
import type { ElectronApplication } from "playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../../tools/themeHarness";

test.describe("Profile IPC end-to-end", () => {
  let app: ElectronApplication | null = null;

  test.afterEach(async () => {
    await closeDiagnosticsApp(app);
    app = null;
  });

  test("renders profile list, creates profile, and tests prompt", async () => {
    test.setTimeout(120_000);
    const handle = await launchDiagnosticsWindow();
    app = handle.app;
    const window = handle.window;

    await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

    await window.getByRole("button", { name: /settings/i }).click();
    await window.getByRole("tab", { name: /llm profiles/i }).click();

    const profileTable = window.getByRole("table", { name: /llm profiles/i });
    await expect(profileTable).toBeVisible();
  await expect(profileTable.getByRole("row")).not.toHaveCount(0);

    await window.getByRole("button", { name: /add profile/i }).click();

    const modal = window.getByRole("dialog", { name: /create llm profile/i });
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: /profile name/i }).fill("IPC QA Profile");
    await modal.getByRole("combobox", { name: /provider/i }).selectOption("openai");
    await modal.getByRole("textbox", { name: /endpoint url/i }).fill("https://api.openai.com/v1");
    await modal.getByRole("textbox", { name: /api key/i }).fill("sk-test-qa");
    await modal.getByRole("textbox", { name: /deployment name|model id/i }).fill("gpt-4o-mini");
    await modal.getByRole("button", { name: /save profile/i }).click();

    const newRow = profileTable.getByRole("row", { name: /ipc qa profile/i });
    await expect(newRow).toBeVisible();
    await expect(newRow.getByTestId("llm-profile-encryption-status")).toHaveText(/encrypted/i);

    await newRow.getByRole("button", { name: /test connection/i }).click();
    const status = window.getByRole("status");
    await expect(status).toHaveText(/testing prompt/i);
    await expect(status).toHaveText(/prompt (succeeded|failed)/i);
  });
});
