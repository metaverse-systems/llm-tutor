import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installLLMSettingsHarness } from "./utils/llmHarness";

type AxeSnapshot = {
  state: string;
  url: string;
  passes: number;
  violations: number;
  incomplete: number;
  inapplicable: number;
};

const settingsUrl = "/settings/llm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportDirectory = path.resolve(__dirname, "../../../../docs/reports/accessibility");
const reportPath = path.resolve(reportDirectory, "007-llm-profiles.json");

async function analyzeState(page: Page, label: string): Promise<AxeSnapshot> {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  const results = await builder.analyze();

  expect(results.violations, `${label} has accessibility violations`).toHaveLength(0);

  return {
    state: label,
    url: results.url,
    passes: results.passes.length,
    violations: results.violations.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length
  };
}

test.describe("LLM settings accessibility snapshots", () => {
  test.beforeEach(async ({ page }) => {
    await installLLMSettingsHarness(page);
  });

  test("generate axe snapshots for primary UI states", async ({ page }) => {
    await page.goto(settingsUrl);
    await expect(page.getByTestId("llm-profiles-page")).toBeVisible();

    const snapshots: AxeSnapshot[] = [];

    snapshots.push(await analyzeState(page, "settings"));

    const addProfileButton = page.getByTestId("add-profile-button");
    await addProfileButton.click();
    const profileDialog = page.getByTestId("profile-form-dialog");
    await expect(profileDialog).toBeVisible();
    snapshots.push(await analyzeState(page, "profile-form"));

    const cancelButton = profileDialog.getByRole("button", { name: /cancel/i });
    await cancelButton.click();
    await expect(profileDialog).not.toBeVisible();

    const remoteButton = page.getByTestId("add-remote-provider-button");
    await remoteButton.click();
    const consentDialog = page.getByTestId("consent-dialog");
    await expect(consentDialog).toBeVisible();
    snapshots.push(await analyzeState(page, "consent-dialog"));

    const consentCancel = consentDialog.getByTestId("consent-cancel-button");
    await consentCancel.click();
    await expect(consentDialog).not.toBeVisible();

    const metadata = {
      generatedAt: new Date().toISOString(),
      route: settingsUrl,
      reviewer: "axe-core@playwright",
      snapshots
    };

    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(metadata, null, 2)}\n`);
  });
});
