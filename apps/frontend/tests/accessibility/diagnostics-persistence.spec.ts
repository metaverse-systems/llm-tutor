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
		page.on("console", (message) => {
			console.log(`playwright-page:${message.type()}`, message.text());
		});
		await page.evaluate(() => {
			(window as unknown as { __keyLogs?: string[] }).__keyLogs = [];
			document.addEventListener("keydown", (event) => {
				const target = window as unknown as { __keyLogs?: string[] };
				target.__keyLogs = [...(target.__keyLogs ?? []), event.key];
			}, { once: false });
		});

		const highContrastToggle = await toggleSwitch(page, /high contrast/i);
		const remoteProvidersToggle = await toggleSwitch(page, /remote providers/i);
		const activeElement = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
		console.log("playwright-debug:activeElement", activeElement);

		const highContrastValue = await highContrastToggle.getAttribute("aria-checked");
		const remoteProvidersValue = await remoteProvidersToggle.getAttribute("aria-checked");
		console.log("playwright-debug:aria", { highContrastValue, remoteProvidersValue });
		const debugState = await page.evaluate(() => (window as unknown as { __diagnosticsDebug?: unknown }).__diagnosticsDebug ?? null);
		console.log("playwright-debug:window-debug", debugState);
		const keyLogs = await page.evaluate(() => (window as unknown as { __keyLogs?: string[] }).__keyLogs ?? []);
		console.log("playwright-debug:keylogs", keyLogs);

		await expect(highContrastToggle).toHaveAttribute("aria-checked", "true");
		await expect(remoteProvidersToggle).toHaveAttribute("aria-checked", "true");
		await expect(page.locator('[data-testid="diagnostics-consent-summary"]')).toContainText("Remote providers enabled");

		const outcome = await page.evaluate(() => (window as unknown as { __diagnosticsDebug?: { lastPreferenceOutcome?: unknown } }).__diagnosticsDebug?.lastPreferenceOutcome ?? null);
		console.log("playwright-debug:lastPreferenceOutcome", outcome);
		expect(outcome, "preference update should return optimistic record").not.toBeNull();

		await page.reload();

		await expect(page.locator("body")).toHaveAttribute("data-appearance", "high-contrast");
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

		const panelAlert = page.getByTestId("diagnostics-storage-panel-alert");
		await expect(panelAlert).toContainText("settings will apply for this session only");
		await expect(panelAlert).toContainText(/storage/i);

		const toastAlert = page.getByTestId("diagnostics-storage-alert-toast");
		await expect(toastAlert).toContainText(/storage/i);
	});
});
