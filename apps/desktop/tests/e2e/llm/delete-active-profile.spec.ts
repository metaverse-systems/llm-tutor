import { expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../../tools/themeHarness";

async function navigateToLlmSettings(page: Page) {
	await page.waitForSelector('[data-testid="landing-diagnostics-cta"]');

	const settingsLink = page.getByRole("button", { name: /settings/i });
	await expect(settingsLink).toBeVisible();
	await settingsLink.click();

	const llmTab = page.getByRole("tab", { name: /llm profiles/i });
	await expect(llmTab).toBeVisible();
	await llmTab.click();
}

async function addAzureProfile(page: Page, name: string, endpointSuffix: string) {
	const addProfileButton = page.getByRole("button", { name: /add profile/i });
	await expect(addProfileButton).toBeVisible();
	await addProfileButton.click();

	const consentDialog = page.getByRole("dialog", { name: /remote provider consent/i });
	await expect(consentDialog).toBeVisible();
	await consentDialog.getByRole("button", { name: /accept & continue/i }).click();

	await page.getByRole("textbox", { name: /profile name/i }).fill(name);
	await page.getByRole("combobox", { name: /provider/i }).selectOption("azure");
	await page
		.getByRole("textbox", { name: /endpoint url/i })
		.fill(`https://workspace.openai.azure.com/openai/deployments/${endpointSuffix}`);
	await page.getByRole("textbox", { name: /api key/i }).fill(`sk-test-${endpointSuffix}`);
	await page.getByRole("textbox", { name: /deployment name|model id/i }).fill(endpointSuffix);

	const saveButton = page.getByRole("button", { name: /save profile/i });
	await expect(saveButton).toBeVisible();
	await saveButton.click();

	const profileRow = page.getByRole("row", { name: new RegExp(name, "i") });
	await expect(profileRow).toBeVisible();
	return profileRow;
}

test.describe("Desktop LLM profile deletion", () => {
	let app: ElectronApplication | null = null;

	test.afterEach(async () => {
		await closeDiagnosticsApp(app);
		app = null;
	});

	test("deleting active profile requires alternate selection", async () => {
		test.setTimeout(120_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await navigateToLlmSettings(window);

		const profileA = await addAzureProfile(window, "Azure Primary", "primary");
		await addAzureProfile(window, "Azure Secondary", "secondary");

		const activateButton = profileA.getByRole("button", { name: /activate/i });
		await expect(activateButton).toBeVisible();
		await activateButton.click();

		const statusRegion = window.getByRole("status");
		await expect(statusRegion).toHaveText(/active profile updated/i);

		const deleteButton = profileA.getByRole("button", { name: /delete/i });
		await expect(deleteButton).toBeVisible();
		await deleteButton.click();

		const deleteDialog = window.getByRole("alertdialog", { name: /delete profile/i });
		await expect(deleteDialog).toBeVisible();
		await expect(deleteDialog.getByText(/select an alternate profile/i)).toBeVisible();

		const alternateSelect = deleteDialog.getByRole("combobox", { name: /alternate profile/i });
		await expect(alternateSelect).toBeVisible();
		await alternateSelect.selectOption({ label: "Azure Secondary" });

		const confirmDelete = deleteDialog.getByRole("button", { name: /delete/i });
		await confirmDelete.click();

		await expect(window.getByRole("row", { name: /azure primary/i })).not.toBeVisible();
		await expect(statusRegion).toHaveText(/profile deleted/i);
		await expect(window.getByRole("row", { name: /azure secondary/i })).toBeVisible();
		await expect(
			window
				.getByRole("row", { name: /azure secondary/i })
				.getByTestId("llm-profile-active-badge")
		).toHaveText(/active/i);
	});
});
