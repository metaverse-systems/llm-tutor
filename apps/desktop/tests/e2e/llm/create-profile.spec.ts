import { expect, test } from "@playwright/test";
import type { ElectronApplication } from "playwright";

import { closeDiagnosticsApp, launchDiagnosticsWindow } from "../../tools/themeHarness";

test.describe("Desktop LLM profile creation", () => {
	let app: ElectronApplication | null = null;

	test.afterEach(async () => {
		await closeDiagnosticsApp(app);
		app = null;
	});

	test("user can add an Azure profile and test the connection", async () => {
		test.setTimeout(90_000);
		const handle = await launchDiagnosticsWindow();
		app = handle.app;
		const window = handle.window;

		await window.waitForSelector('[data-testid="landing-diagnostics-cta"]');

		const settingsLink = window.getByRole("button", { name: /settings/i });
		await expect(settingsLink).toBeVisible();
		await settingsLink.click();

		const llmTab = window.getByRole("tab", { name: /llm profiles/i });
		await expect(llmTab).toBeVisible();
		await llmTab.click();

		const addProfileButton = window.getByRole("button", { name: /add profile/i });
		await expect(addProfileButton).toBeVisible();
		await addProfileButton.click();

		const consentDialog = window.getByRole("dialog", { name: /remote provider consent/i });
		await expect(consentDialog).toBeVisible();
		await consentDialog.getByRole("button", { name: /accept & continue/i }).click();

		await window.getByRole("textbox", { name: /profile name/i }).fill("Azure OpenAI Prod");
		await window.getByRole("combobox", { name: /provider/i }).selectOption("azure");
		await window
			.getByRole("textbox", { name: /endpoint url/i })
			.fill("https://workspace.openai.azure.com/openai/deployments/gpt-4");
		await window.getByRole("textbox", { name: /api key/i }).fill("sk-test-123");
		await window.getByRole("textbox", { name: /deployment name|model id/i }).fill("gpt-4");

		const saveButton = window.getByRole("button", { name: /save profile/i });
		await expect(saveButton).toBeVisible();
		await saveButton.click();

		const profileRow = window.getByRole("row", { name: /azure openai prod/i });
		await expect(profileRow).toBeVisible();
		await expect(profileRow.getByTestId("llm-profile-encryption-status")).toHaveText(/encrypted/i);

		const testButton = profileRow.getByRole("button", { name: /test connection/i });
		await testButton.click();
		const statusRegion = window.getByRole("status");
		await expect(statusRegion).toHaveText(/testing connection/i);
		await expect(statusRegion).toHaveText(/connection (succeeded|failed)/i);
	});
});
