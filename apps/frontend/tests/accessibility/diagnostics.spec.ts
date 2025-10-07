import { test, expect, type Page } from "@playwright/test";

const landingUrl = "/";

function getActiveTestId(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
}

test.describe("Diagnostics accessibility regressions", () => {
  test("keyboard focus order cycles through diagnostics controls", async ({ page }) => {
    await page.goto(landingUrl);

    const expectedOrder = [
      "landing-diagnostics-cta",
      "landing-accessibility-toggle-high-contrast",
      "landing-accessibility-toggle-reduce-motion"
    ];

    const actualOrder: string[] = [];

    for (const _ of expectedOrder) {
      await page.keyboard.press("Tab");
      actualOrder.push(await getActiveTestId(page));
    }

    expect(actualOrder).toStrictEqual(expectedOrder);
  });

  test("high contrast toggle is operable via keyboard and persists", async ({ page }) => {
    await page.goto(landingUrl);

    const highContrastToggle = page.getByRole("switch", { name: /high contrast/i });

    await highContrastToggle.focus();
    await expect(highContrastToggle).toHaveAttribute("aria-checked", "false");

    await highContrastToggle.press("Space");
    await expect(highContrastToggle).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("body")).toHaveAttribute("data-color-mode", "high-contrast");

    await page.reload();

    await expect(page.locator("body")).toHaveAttribute("data-color-mode", "high-contrast");
    await expect(highContrastToggle).toHaveAttribute("aria-checked", "true");
  });

  test("reduced motion toggle removes animated affordances", async ({ page }) => {
    await page.goto(landingUrl);

    const reduceMotionToggle = page.getByRole("switch", { name: /reduce motion/i });
    await reduceMotionToggle.focus();
    await expect(reduceMotionToggle).toHaveAttribute("aria-checked", "false");

    const animatedElements = page.locator('[data-testid="diagnostics-panel"] [data-animates="true"]');
    await expect(animatedElements).not.toHaveCount(0);

    await reduceMotionToggle.press("Space");
    await expect(reduceMotionToggle).toHaveAttribute("aria-checked", "true");

    await expect(page.locator("body")).toHaveAttribute("data-reduce-motion", "true");
    await expect(animatedElements).toHaveCount(0);
  });
});
