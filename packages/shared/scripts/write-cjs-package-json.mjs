import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const targetDir = join(__dirname, "..", "dist-cjs");
const packageJsonPath = join(targetDir, "package.json");

await mkdir(targetDir, { recursive: true });

const packageJson = {
  type: "commonjs"
};

await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
