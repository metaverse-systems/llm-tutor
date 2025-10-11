// eslint-disable-next-line import/no-named-as-default-member
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { ElectronApplication } from "playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../../tools/themeHarness";

test.describe("Profile IPC accessibility: error messaging", () => {
  let app: ElectronApplication | null = null;

  test.afterEach(async () => {
    await closeDiagnosticsApp(app);
    app = null;
  });

  test("surface validation and outage banners without axe violations", async () => {
    test.setTimeout(120_000);
    const handle = await launchDiagnosticsWindow();
    app = handle.app;
    const window = handle.window;

    await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

    await window.getByRole("button", { name: /settings/i }).click();
    await window.getByRole("tab", { name: /llm profiles/i }).click();

    await window.getByRole("button", { name: /add profile/i }).click();

    const modal = window.getByRole("dialog", { name: /create llm profile/i });
    await modal.getByRole("textbox", { name: /profile name/i }).fill(" ");
    await modal.getByRole("textbox", { name: /endpoint url/i }).fill("not-a-url");
    await modal.getByRole("textbox", { name: /api key/i }).fill(" ");
    await modal.getByRole("button", { name: /save profile/i }).click();

    const errorRegion = window.getByRole("alert");
    await expect(errorRegion).toBeVisible();
    await expect(errorRegion).toHaveAttribute("aria-live", /assertive/i);

    await window.getByRole("button", { name: /simulate safe storage outage/i }).click();
    const outageBanner = window.getByRole("status", { name: /safe storage unavailable/i });
    await expect(outageBanner).toBeVisible();
    await expect(outageBanner).toHaveAttribute("role", "status");

    const axe = new AxeBuilder({ page: window })
      .include("main")
      .withTags(["wcag2a", "wcag2aa"])
      .setLegacyMode(true);

    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});
