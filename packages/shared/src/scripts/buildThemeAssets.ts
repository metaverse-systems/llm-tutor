import { fileURLToPath } from "node:url";

import { writeThemeAssets } from "../styles/generateThemeAssets";

async function run(): Promise<void> {
  const outDir = fileURLToPath(new URL("../", import.meta.url));
  const result = await writeThemeAssets({ outDir });
  console.log(`Generated theme assets:\n  CSS → ${result.cssPath}\n  JSON → ${result.jsonPath}`);
}

void run().catch((error) => {
  console.error("Failed to generate theme assets", error);
  process.exitCode = 1;
});
