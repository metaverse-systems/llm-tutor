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
    test.setTimeout(60000);
    const handle = await launchDiagnosticsWindow();
    app = handle.app;

    await handle.window.waitForFunction(() => {
      const body = document.body;
      return !!body && body.getAttribute("data-theme") === "contrast";
    });

    await expect(handle.window.locator("body")).toHaveAttribute("data-theme", "contrast");
    await expect(handle.window.locator("body")).toHaveAttribute("data-motion", "reduced");

    await handle.window.waitForFunction(() => {
      const body = document.body;
      if (!body) {
        return false;
      }
      const styles = window.getComputedStyle(body);
      const surfaceCanvas = styles.getPropertyValue("--surface-canvas").trim().toLowerCase();
      const surfaceMuted = styles.getPropertyValue("--surface-muted").trim().toLowerCase();
      const backgroundColor = styles.backgroundColor.trim().toLowerCase();
      const expectedBodyBackgrounds = new Set([
        "rgb(10, 10, 10)",
        "#0a0a0a"
      ]);

      const highContrastButton = document.querySelector(
        '[data-testid="landing-accessibility-toggle-high-contrast"]'
      );
      if (!highContrastButton) {
        return false;
      }
      const buttonBackground = window.getComputedStyle(highContrastButton).backgroundColor.trim().toLowerCase();

      return (
        surfaceCanvas === "#0a0a0a" &&
        surfaceMuted !== "" &&
        surfaceMuted !== "#edf2ff" &&
        expectedBodyBackgrounds.has(backgroundColor) &&
        buttonBackground !== "rgb(255, 255, 255)"
      );
    });

    const axe = new AxeBuilder({ page: handle.window })
      .include("body")
      .withTags(["wcag2a", "wcag2aa"])
      .setLegacyMode(true);

    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});
