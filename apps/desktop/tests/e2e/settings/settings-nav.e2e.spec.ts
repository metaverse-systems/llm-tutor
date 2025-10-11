import { expect, test } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import AxeBuilder from "@axe-core/playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../../tools/themeHarness";

const settingsUrl = "/settings";

test.describe("Electron Settings page navigation and accessibility", () => {
	let app: ElectronApplication | null = null;

	test.afterEach(async () => {
		await closeDiagnosticsApp(app);
		app = null;
	});

	test("gear icon activation via keyboard navigates to Settings", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

		// Tab to the gear icon
		const gearIcon = window.locator("#settings-gear");
		await expect(gearIcon).toBeVisible();
		
		// Focus and activate via keyboard
		await gearIcon.focus();
		await window.keyboard.press("Enter");

		// Should navigate to settings
		await window.waitForURL(`**${settingsUrl}`);
	});

	test("gear icon activation via mouse navigates to Settings", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

		const gearIcon = window.locator("#settings-gear");
		await expect(gearIcon).toBeVisible();
		
		await gearIcon.click();

		await window.waitForURL(`**${settingsUrl}`);
	});

	test("focus lands on Settings heading after navigation", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		// Wait for heading to be visible
		const heading = window.locator("h1#settings-heading");
		await expect(heading).toBeVisible();
		await expect(heading).toHaveText(/Settings/i);

		// Check focus is on the heading
		const activeId = await window.evaluate(() => document.activeElement?.getAttribute("id") ?? "");
		expect(activeId).toBe("settings-heading");
	});

	test("Return to previous view skip link is present and keyboard-operable", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		const skipLink = window.getByRole("link", { name: /return to previous view/i });
		await expect(skipLink).toBeVisible();
		
		// Verify it's keyboard operable
		await skipLink.focus();
		await window.keyboard.press("Enter");
		
		// Should navigate away from settings
		await expect(window).not.toHaveURL(`**${settingsUrl}`);
	});

	test("General, LLM Profiles, and Diagnostics sections are visible", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		// Check all three sections exist
		const generalSection = window.locator('[aria-labelledby*="general"]');
		const llmProfilesSection = window.locator('[aria-labelledby*="llm-profiles"]');
		const diagnosticsSection = window.locator('[aria-labelledby*="diagnostics"]');

		await expect(generalSection).toBeVisible();
		await expect(llmProfilesSection).toBeVisible();
		await expect(diagnosticsSection).toBeVisible();
	});

	test("telemetry toggle defaults to off with explanatory copy", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		// Find telemetry toggle
		const telemetryToggle = window.getByRole("switch", { name: /telemetry/i });
		await expect(telemetryToggle).toBeVisible();
		
		// Should default to off (false)
		await expect(telemetryToggle).toHaveAttribute("aria-checked", "false");

		// Check for explanatory copy about opt-out default
		const explanatoryText = window.locator("text=/opt-out|local|data stays local/i");
		await expect(explanatoryText).toBeVisible();
	});

	test("Settings container passes axe accessibility checks", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		// Wait for the settings container to be present
		await window.waitForSelector("#settings-heading");

		// Run axe accessibility scan on the settings page
		const accessibilityScanResults = await new AxeBuilder({ page: window })
			.include("main")
			.analyze();

		expect(accessibilityScanResults.violations).toEqual([]);
	});

	test("gear icon shows active styling when on Settings route", async () => {
		test.setTimeout(60_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.goto(settingsUrl);

		const gearIcon = window.locator("#settings-gear");
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
