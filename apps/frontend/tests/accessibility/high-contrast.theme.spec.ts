import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const landingUrl = "/";

async function enableHighContrast(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("switch", { name: /high contrast/i });
  await toggle.focus();
  await toggle.press("Space");
  return toggle;
}

test.describe("Unified theme high contrast accessibility", () => {
  test("applies high contrast tokens and passes axe", async ({ page }) => {
    await page.goto(landingUrl);

    const toggle = await enableHighContrast(page);

    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("body")).toHaveAttribute("data-theme", "contrast");

    const axe = new AxeBuilder({ page })
      .include("#root")
      .withTags(["wcag2a", "wcag2aa"]);

    const results = await axe.analyze();
    expect(results.violations).toEqual([]);
  });
});
