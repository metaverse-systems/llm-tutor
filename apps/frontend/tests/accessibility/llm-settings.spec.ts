import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

const settingsUrl = "/settings/llm";

async function getActiveTestId(page: Page) {
	return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
}

test.describe("LLM settings accessibility regressions", () => {
	test("page has no axe-core violations", async ({ page }) => {
		await page.goto(settingsUrl);
		const builder = new AxeBuilder({ page });
		const results = await builder.analyze();
		expect(results.violations).toHaveLength(0);
	});

	test("profile list supports keyboard navigation", async ({ page }) => {
		await page.goto(settingsUrl);

		const expectedOrder = [
			"llm-settings-add-profile",
			"llm-settings-profile-0",
			"llm-settings-profile-0-activate",
			"llm-settings-profile-0-delete",
			"llm-settings-profile-1"
		];

		const actualOrder: string[] = [];
		let guard = 0;
		while (actualOrder.length < expectedOrder.length && guard < expectedOrder.length * 5) {
			await page.keyboard.press("Tab");
			const activeId = await getActiveTestId(page);
			if (activeId && actualOrder.at(-1) !== activeId) {
				actualOrder.push(activeId);
			}
			guard += 1;
		}

		expect(actualOrder).toStrictEqual(expectedOrder);

		const activateButton = page.getByTestId("llm-settings-profile-0-activate");
		await activateButton.press("Enter");
		await expect(page.getByRole("status")).toHaveText(/profile activated/i);

		const deleteButton = page.getByTestId("llm-settings-profile-0-delete");
		await deleteButton.press("Delete");
		const deleteDialog = page.getByRole("alertdialog", { name: /delete profile/i });
		await expect(deleteDialog).toBeVisible();
	});

	test("consent dialog traps focus until dismissed", async ({ page }) => {
		await page.goto(settingsUrl);

		const addRemoteButton = page.getByRole("button", { name: /add remote provider/i });
		await addRemoteButton.focus();
		await addRemoteButton.press("Enter");

		const consentDialog = page.getByRole("dialog", { name: /remote provider consent/i });
		await expect(consentDialog).toBeVisible();
		const acceptButton = consentDialog.getByRole("button", { name: /accept/i });
		const cancelButton = consentDialog.getByRole("button", { name: /cancel/i });

		await acceptButton.focus();
		await page.keyboard.press("Tab");
		await expect(await page.evaluate(() => document.activeElement?.textContent)).toMatch(/Cancel/i);
		await page.keyboard.press("Tab");
		await expect(await page.evaluate(() => document.activeElement?.textContent)).toMatch(/Accept/i);

		await page.keyboard.press("Escape");
		await expect(consentDialog).not.toBeVisible();
		await expect(addRemoteButton).toBeFocused();
	});
});
