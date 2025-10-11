import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { installLLMSettingsHarness } from "./utils/llmHarness";

const settingsUrl = "/settings/llm";

async function tabTo(page: Page, locator: Locator, description: string, maxTabs = 12): Promise<void> {
	for (let attempt = 0; attempt < maxTabs; attempt += 1) {
		await page.keyboard.press("Tab");
		try {
			await expect(locator, `${description} should receive focus`).toBeFocused({ timeout: 200 });
			return;
		} catch (error) {
			if (attempt === maxTabs - 1) {
				const details = error instanceof Error ? `: ${error.message}` : "";
				throw new Error(`Failed to move focus to ${description} after ${maxTabs} Tab presses${details}`);
			}
		}
	}
}

test.describe("LLM settings accessibility regressions", () => {
  test.beforeEach(async ({ page }) => {
    await installLLMSettingsHarness(page);
  });

	test("page has no axe-core violations", async ({ page }) => {
		await page.goto(settingsUrl);
		await expect(page.getByTestId("llm-profiles-page")).toBeVisible();
		const builder = new AxeBuilder({ page });
		const results = await builder.analyze();
		expect(results.violations).toHaveLength(0);
	});

	test("profile list supports keyboard navigation", async ({ page }) => {
		await page.goto(settingsUrl);

		const addProfileButton = page.getByTestId("add-profile-button");
		await addProfileButton.focus();
		await expect(addProfileButton).toBeFocused();

		await tabTo(page, page.getByTestId("add-remote-provider-button"), "Add remote provider button");
		await tabTo(page, page.getByTestId("run-discovery-button"), "Run auto-discovery button");
		await tabTo(page, page.getByTestId("refresh-profiles-button"), "Refresh profiles button");

		const activateButton = page.getByTestId("activate-profile-profile-azure");
		await tabTo(page, activateButton, "Azure activate button");
		await activateButton.press("Enter");
		await expect(page.getByTestId("llm-status-announcer")).toHaveText(/activated azure production/i);

		await tabTo(page, page.getByTestId("edit-profile-profile-azure"), "Azure edit button");

		const deleteButton = page.getByTestId("delete-profile-profile-azure");
		await tabTo(page, deleteButton, "Azure delete button");
		await deleteButton.press("Delete");
		const deleteDialog = page.getByRole("alertdialog", { name: /delete/i });
		await expect(deleteDialog).toBeVisible();
	});

	test("consent dialog traps focus until dismissed", async ({ page }) => {
		await page.goto(settingsUrl);

		const addRemoteButton = page.getByRole("button", { name: /add remote provider/i });
		await addRemoteButton.focus();
		await addRemoteButton.press("Enter");

		const consentDialog = page.getByRole("alertdialog", { name: /remote provider consent/i });
		await expect(consentDialog).toBeVisible();
		const acceptButton = consentDialog.getByRole("button", { name: /accept/i });
		const cancelButton = consentDialog.getByRole("button", { name: /cancel/i });
		const privacyLink = consentDialog.getByRole("link", { name: /privacy documentation/i });

		await expect(privacyLink).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		await expect(acceptButton).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(privacyLink).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(cancelButton).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(acceptButton).toBeFocused();

		await page.keyboard.press("Escape");
		await expect(consentDialog).not.toBeVisible();
		await expect(addRemoteButton).toBeFocused();
	});
});
