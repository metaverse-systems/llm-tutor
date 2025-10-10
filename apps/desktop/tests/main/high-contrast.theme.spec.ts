import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { ElectronApplication } from "playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../tools/themeHarness";

test.describe("Desktop diagnostics high contrast theme", () => {
  let app: ElectronApplication | null = null;

  test.afterEach(async () => {
    await closeDiagnosticsApp(app);
    app = null;
  });

  test("loads shared theme assets, syncs preferences, and passes axe", async () => {
    const handle = await launchDiagnosticsWindow();
    app = handle.app;

    await handle.window.waitForFunction(() => {
      const body = document.body;
      return !!body && body.getAttribute("data-theme") === "contrast";
    });

    await expect(handle.window.locator("body")).toHaveAttribute("data-theme", "contrast");
    await expect(handle.window.locator("body")).toHaveAttribute("data-motion", "reduced");

    const axe = new AxeBuilder({ page: handle.window })
      .include("body")
      .withTags(["wcag2a", "wcag2aa"])
      .setLegacyMode(true);

    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});
