import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let mockUserDataDir = "";

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => mockUserDataDir || path.join(os.tmpdir(), "llm-tutor"))
	}
}));

describe("export log helpers", () => {
	let tempDirectories: string[] = [];

	beforeEach(() => {
		tempDirectories = [];
	});

	afterEach(async () => {
		for (const dir of tempDirectories) {
			await fs.rm(dir, { recursive: true, force: true });
		}
		mockUserDataDir = "";
	});

	async function createTempDir(prefix: string): Promise<string> {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
		tempDirectories.push(dir);
		return dir;
	}

	it("creates a log file with a timestamped entry", async () => {
		mockUserDataDir = await createTempDir("export-log-userdata-");
		const module = await import("../../src/main/logging/exportLog");
		const handle = await module.prepareExportLog();

		await handle.write({ status: "success", messages: ["All good"] });

		const contents = await fs.readFile(handle.filePath, "utf8");
		const lines = contents.trim().split(/\r?\n/);
		expect(lines).toHaveLength(1);

		const entry = JSON.parse(lines[0]) as Record<string, unknown>;
		expect(entry.status).toBe("success");
		expect(typeof entry.timestamp).toBe("string");
		expect(entry.messages).toEqual(["All good"]);
	});

	it("respects custom log directory overrides", async () => {
		const logDirectory = await createTempDir("export-log-override-");
		const module = await import("../../src/main/logging/exportLog");

		const handle = await module.prepareExportLog({ logDirectory, suffix: "custom" });

		expect(path.dirname(handle.filePath)).toBe(logDirectory);
		expect(path.basename(handle.filePath)).toMatch(/custom/);
	});

	it("rethrows when log file cannot be created", async () => {
		mockUserDataDir = await createTempDir("export-log-failure-");
		const module = await import("../../src/main/logging/exportLog");
		const { prepareExportLog } = module;

		const targetDir = module.resolveLogDirectory();
		await fs.mkdir(targetDir, { recursive: true });
		const spy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));

		await expect(prepareExportLog()).rejects.toThrow("disk full");

		spy.mockRestore();
	});
});