import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const settingsUrl = "/settings";

function getActiveElementId(page: Page) {
	return page.evaluate(() => document.activeElement?.getAttribute("id") ?? "");
}

test.describe("Settings page navigation and accessibility", () => {
	test("gear icon activation via keyboard navigates to Settings", async ({ page }) => {
		await page.goto("/");

		// Tab to the gear icon
		const gearIcon = page.locator("#settings-gear");
		await expect(gearIcon).toBeVisible();
		
		// Focus and activate via keyboard
		await gearIcon.focus();
		await page.keyboard.press("Enter");

		// Should navigate to settings
		await expect(page).toHaveURL(settingsUrl);
	});

	test("gear icon activation via mouse navigates to Settings", async ({ page }) => {
		await page.goto("/");

		const gearIcon = page.locator("#settings-gear");
		await expect(gearIcon).toBeVisible();
		
		await gearIcon.click();

		await expect(page).toHaveURL(settingsUrl);
	});

	test("focus lands on Settings heading after navigation", async ({ page }) => {
		await page.goto(settingsUrl);

		// Wait for heading to be visible
		const heading = page.locator("h1#settings-heading");
		await expect(heading).toBeVisible();
		await expect(heading).toHaveText(/Settings/i);

		// Check focus is on the heading
		const activeId = await getActiveElementId(page);
		expect(activeId).toBe("settings-heading");
	});

	test("Return to previous view skip link is present and keyboard-operable", async ({ page }) => {
		await page.goto(settingsUrl);

		const skipLink = page.getByRole("link", { name: /return to previous view/i });
		await expect(skipLink).toBeVisible();
		
		// Verify it's keyboard operable
		await skipLink.focus();
		await page.keyboard.press("Enter");
		
		// Should navigate away from settings
		await expect(page).not.toHaveURL(settingsUrl);
	});

	test("General, LLM Profiles, and Diagnostics sections are visible", async ({ page }) => {
		await page.goto(settingsUrl);

		// Check all three sections exist
		const generalSection = page.locator('[aria-labelledby*="general"]');
		const llmProfilesSection = page.locator('[aria-labelledby*="llm-profiles"]');
		const diagnosticsSection = page.locator('[aria-labelledby*="diagnostics"]');

		await expect(generalSection).toBeVisible();
		await expect(llmProfilesSection).toBeVisible();
		await expect(diagnosticsSection).toBeVisible();
	});

	test("telemetry toggle defaults to off with explanatory copy", async ({ page }) => {
		await page.goto(settingsUrl);

		// Find telemetry toggle
		const telemetryToggle = page.getByRole("switch", { name: /telemetry/i });
		await expect(telemetryToggle).toBeVisible();
		
		// Should default to off (false)
		await expect(telemetryToggle).toHaveAttribute("aria-checked", "false");

		// Check for explanatory copy about opt-out default
		const explanatoryText = page.locator("text=/opt-out|local|data stays local/i");
		await expect(explanatoryText).toBeVisible();
	});

	test("Settings container passes axe accessibility checks", async ({ page }) => {
		await page.goto(settingsUrl);

		// Wait for the settings container to be present
		await page.waitForSelector("#settings-heading");

		// Run axe accessibility scan on the settings page
		const accessibilityScanResults = await new AxeBuilder({ page })
			.include("main")
			.analyze();

		expect(accessibilityScanResults.violations).toEqual([]);
	});

	test("gear icon shows active styling when on Settings route", async ({ page }) => {
		await page.goto(settingsUrl);

		const gearIcon = page.locator("#settings-gear");
		await expect(gearIcon).toBeVisible();
		
		// Check for active state attribute or class
		const hasActiveState = await gearIcon.evaluate((el) => {
			return el.classList.contains("active") || 
				   el.getAttribute("aria-current") === "page" ||
				   el.getAttribute("data-active") === "true";
		});
		
		expect(hasActiveState).toBe(true);
	});
});
