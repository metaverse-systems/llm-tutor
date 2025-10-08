import { test, expect, type Page } from "@playwright/test";

declare global {
	interface Window {
		__diagnosticsDebug?: {
			simulatePreferenceVaultFailure?: () => void;
		};
	}
}

export {};

const landingUrl = "/";

async function toggleSwitch(page: Page, name: RegExp) {
	const control = page.getByRole("switch", { name });
	await control.focus();
	await control.press("Space");
	return control;
}

test.describe("Diagnostics preference persistence", () => {
	test("persists accessibility and consent toggles across reload", async ({ page }) => {
		await page.goto(landingUrl);

		const highContrastToggle = await toggleSwitch(page, /high contrast/i);
		const remoteProvidersToggle = await toggleSwitch(page, /remote providers/i);

		await expect(highContrastToggle).toHaveAttribute("aria-checked", "true");
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "true");
		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers enabled");

		await page.reload();

		await expect(page.locator("body")).toHaveAttribute("data-color-mode", "high-contrast");
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "true");
		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers enabled");
	});

	test("shows consent reminder when remote providers remain disabled after restart", async ({ page }) => {
		await page.goto(landingUrl);

		const remoteProvidersToggle = page.getByRole("switch", { name: /remote providers/i });
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "false");
		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers are disabled");

		await remoteProvidersToggle.focus();
		await remoteProvidersToggle.press("Space");
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "true");
		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers enabled");

		await remoteProvidersToggle.press("Space");
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "false");

		await page.reload();

		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers are disabled");
	});

	test("surfaces storage failure fallback copy when vault becomes unavailable", async ({ page }) => {
		await page.goto(landingUrl);

		await page.evaluate(() => {
			return window.__diagnosticsDebug?.simulatePreferenceVaultFailure?.();
		});

		const alert = page.getByRole("alert");
		await expect(alert).toContainText("settings will apply for this session only");
		await expect(alert).toContainText("storage");
	});
});
