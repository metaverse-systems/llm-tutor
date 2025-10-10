import AxeBuilder from "@axe-core/playwright";
import type { ElectronApplication } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../tools/themeHarness";

describe("Desktop diagnostics high contrast theme", () => {
  let app: ElectronApplication | null = null;

  afterEach(async () => {
    await closeDiagnosticsApp(app);
    app = null;
  });

  it("loads shared theme assets, syncs preferences, and passes axe", async () => {
    const handle = await launchDiagnosticsWindow();
    app = handle.app;

    await handle.window.waitForFunction(() => {
      const body = document.body;
      return !!body && body.getAttribute("data-theme") === "contrast";
    });

    const theme = await handle.window.getAttribute("body", "data-theme");
    expect(theme).toBe("contrast");

    const motion = await handle.window.getAttribute("body", "data-motion");
    expect(motion).toBe("reduced");

    const axe = new AxeBuilder({ page: handle.window })
      .include("body")
      .withTags(["wcag2a", "wcag2aa"])
      .setLegacyMode(true);

    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});
