import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "@clack/prompts";
import { parse } from "smol-toml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NbsConfigLoader } from "@/config.js";

const NEW_ID = "11111111-1111-4111-8111-111111111111";
const V7_ID = "01a1cf19-3378-709c-b4dd-6e03f561dc93";

const directories: string[] = [];

function temporaryFile(name: string, content: string): string {
	const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
	directories.push(directory);

	const filepath = join(directory, name);
	writeFileSync(filepath, content, { encoding: "utf8" });

	return filepath;
}

afterEach(() => {
	vi.restoreAllMocks();

	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("NbsConfigLoader.patch id", () => {
	it("replaces the id in a json config", async () => {
		const filepath = temporaryFile(
			"nbsproject.json",
			'{\n  "name": "My script",\n  "id": "00000000-0000-4000-8000-000000000000"\n}\n',
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		expect(JSON.parse(readFileSync(filepath, "utf8"))).toEqual({
			name: "My script",
			id: NEW_ID,
		});
		expect(loader.id).toBe(NEW_ID);
	});

	it("patches an extension-less config as toml", async () => {
		const original =
			'# project\nname = "My script"\nid = "00000000-0000-4000-8000-000000000000"\n';

		const filepath = temporaryFile("nbsproject", original);
		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		expect(readFileSync(filepath, "utf8")).toBe(
			original.replace("00000000-0000-4000-8000-000000000000", NEW_ID),
		);
	});

	it("patches the nbs field of package.json", async () => {
		const filepath = temporaryFile(
			"package.json",
			'{\n  "name": "package",\n  "nbs": {\n    "id": "00000000-0000-4000-8000-000000000000"\n  }\n}\n',
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		const parsed = JSON.parse(readFileSync(filepath, "utf8"));
		expect(parsed.name).toBe("package");
		expect(parsed.nbs.id).toBe(NEW_ID);
	});

	it("does not rewrite executable configs and reports the id", async () => {
		const filepath = temporaryFile(
			"nbsproject.js",
			'export default { id: "00000000-0000-4000-8000-000000000000" };\n',
		);
		const original = readFileSync(filepath, "utf8");
		const warn = vi.spyOn(log, "warn").mockImplementation(() => {});

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		expect(readFileSync(filepath, "utf8")).toBe(original);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(NEW_ID));
	});

	it("asks for a manual update when no config file was loaded", async () => {
		const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
		const loader = new NbsConfigLoader();

		await loader.patch({ id: NEW_ID });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining(NEW_ID));
	});

	it("replaces the id in a toml config without touching comments or order", async () => {
		const original = [
			"# project config",
			'name = "My script" # keep me',
			'id = "00000000-0000-4000-8000-000000000000" # script id',
			"",
			"[process.adb]",
			"devicePort = 5555",
			"",
		].join("\n");

		const filepath = temporaryFile("nbsproject.toml", original);
		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		expect(readFileSync(filepath, "utf8")).toBe(
			original.replace("00000000-0000-4000-8000-000000000000", NEW_ID),
		);
	});

	it("inserts a missing toml id before the first table", async () => {
		const filepath = temporaryFile(
			"nbsproject.toml",
			'# project\nname = "My script"\n\n[process.adb]\ndevicePort = 5555\n',
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		expect(readFileSync(filepath, "utf8")).toBe(
			`# project\nname = "My script"\nid = "${NEW_ID}"\n\n[process.adb]\ndevicePort = 5555\n`,
		);
	});

	it("ignores a commented-out toml id", async () => {
		const filepath = temporaryFile(
			"nbsproject.toml",
			'# id = "00000000-0000-4000-8000-000000000000"\nname = "My script"\n',
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		const raw = readFileSync(filepath, "utf8");
		expect(raw).toContain('# id = "00000000-0000-4000-8000-000000000000"');
		expect(raw).toContain(`id = "${NEW_ID}"`);
	});

	it("does not patch an id that belongs to a table", async () => {
		const filepath = temporaryFile(
			"nbsproject.toml",
			'name = "My script"\n\n[meta]\nid = "table-id"\n',
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({ id: NEW_ID });

		const parsed = parse(readFileSync(filepath, "utf8")) as Record<
			string,
			unknown
		>;
		expect(parsed["id"]).toBe(NEW_ID);
		expect((parsed["meta"] as Record<string, unknown>)["id"]).toBe("table-id");
	});
});

describe("NbsConfigLoader.patch", () => {
	it("patches arbitrary toml properties and keeps comments", async () => {
		const original = [
			"# project config",
			'name = "My script" # keep me',
			`id = "${NEW_ID}"`,
			'description = "old" # desc',
			"",
			"[process.adb]",
			"devicePort = 5555",
			"",
		].join("\n");

		const filepath = temporaryFile("nbsproject.toml", original);
		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({
			description: "new description",
			parameters: [{ name: "enableChat", value: true }],
		});

		expect(readFileSync(filepath, "utf8")).toBe(
			[
				"# project config",
				'name = "My script" # keep me',
				`id = "${NEW_ID}"`,
				'description = "new description" # desc',
				'parameters = [ { name = "enableChat", value = true } ]',
				"",
				"[process.adb]",
				"devicePort = 5555",
				"",
			].join("\n"),
		);
		expect(loader.description).toBe("new description");
		expect(loader.parameters).toEqual([{ name: "enableChat", value: true }]);
	});

	it("patches arbitrary json properties", async () => {
		const filepath = temporaryFile(
			"nbsproject.json",
			`{\n  "name": "My script",\n  "id": "${NEW_ID}"\n}\n`,
		);

		const loader = new NbsConfigLoader();
		loader.configFilepath = filepath;

		await loader.patch({
			description: "new description",
			parameters: [{ name: "enableChat", value: true }],
		});

		expect(JSON.parse(readFileSync(filepath, "utf8"))).toEqual({
			name: "My script",
			id: NEW_ID,
			description: "new description",
			parameters: [{ name: "enableChat", value: true }],
		});
	});

	it("writes a property into the config file that defined it", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		const project = `name = "My script"\nid = "${NEW_ID}"\n`;
		const local = "[process.adb]\ndevicePort = 5555\n";

		writeFileSync(join(directory, "nbsproject.toml"), project, {
			encoding: "utf8",
		});
		writeFileSync(join(directory, ".nbsrc"), local, { encoding: "utf8" });

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			await loader.patch({ process: { adb: { devicePort: 7777 } } });

			expect(readFileSync(join(directory, ".nbsrc"), "utf8")).toBe(
				"[process.adb]\ndevicePort = 7777\n",
			);
			expect(readFileSync(join(directory, "nbsproject.toml"), "utf8")).toBe(
				project,
			);
		} finally {
			process.chdir(cwd);
		}
	});
});

describe("NbsConfigLoader.initialize", () => {
	it("loads a toml config", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		writeFileSync(
			join(directory, "nbsproject.toml"),
			`name = "Toml script"\nid = "${NEW_ID}"\n`,
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.name).toBe("Toml script");
			expect(loader.id).toBe(NEW_ID);
			expect(loader.configFilepath).toBe(join(directory, "nbsproject.toml"));
		} finally {
			process.chdir(cwd);
		}
	});

	it("loads an extension-less config as toml", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		writeFileSync(
			join(directory, "nbsproject"),
			`name = "Toml script"\nid = "${NEW_ID}"\n`,
			{ encoding: "utf8" },
		);
		writeFileSync(
			join(directory, ".nbsrc"),
			"[process.adb]\ndevicePort = 16384\n",
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.name).toBe("Toml script");
			expect(loader.id).toBe(NEW_ID);
			expect(loader.process?.adb?.devicePort).toBe(16384);
			expect(loader.configFilepath).toBe(join(directory, "nbsproject"));
		} finally {
			process.chdir(cwd);
		}
	});

	it("loads a config with a UUIDv7 script id", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		writeFileSync(
			join(directory, "nbsproject.toml"),
			`name = "V7 script"\nid = "${V7_ID}"\n`,
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.id).toBe(V7_ID);
		} finally {
			process.chdir(cwd);
		}
	});

	it("resolves the script path relative to the config file", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		const nested = join(directory, "nested");
		mkdirSync(nested);

		writeFileSync(join(directory, "script.lua"), "", { encoding: "utf8" });
		writeFileSync(
			join(directory, "nbsproject.toml"),
			`name = "Toml script"\nid = "${NEW_ID}"\npath = "./script.lua"\n`,
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(nested);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.path).toBe(join(directory, "script.lua"));
		} finally {
			process.chdir(cwd);
		}
	});

	it("uses an explicit script path override from the working directory", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		writeFileSync(join(directory, "old.lua"), "", { encoding: "utf8" });
		writeFileSync(join(directory, "new.lua"), "", { encoding: "utf8" });
		writeFileSync(
			join(directory, "nbsproject.toml"),
			`name = "Toml script"\nid = "${NEW_ID}"\npath = "./old.lua"\n`,
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({ path: "new.lua" });

			expect(loader.path).toBe(join(directory, "new.lua"));
		} finally {
			process.chdir(cwd);
		}
	});

	it("ignores package.json without an nbs field", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		writeFileSync(join(directory, "script.lua"), "", { encoding: "utf8" });
		writeFileSync(
			join(directory, "package.json"),
			JSON.stringify({
				name: "package-script",
				main: "./script.lua",
			}),
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(directory);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.name).toBeUndefined();
			expect(loader.path).toBeUndefined();
		} finally {
			process.chdir(cwd);
		}
	});

	it("resolves a package.json main relative to package.json", async () => {
		const directory = mkdtempSync(join(tmpdir(), "nbs-config-"));
		directories.push(directory);

		const nested = join(directory, "nested");
		mkdirSync(nested);

		writeFileSync(join(directory, "script.lua"), "", { encoding: "utf8" });
		writeFileSync(
			join(directory, "package.json"),
			JSON.stringify({
				name: "package-script",
				main: "./script.lua",
				nbs: { id: NEW_ID },
			}),
			{ encoding: "utf8" },
		);

		const cwd = process.cwd();
		process.chdir(nested);

		try {
			const loader = new NbsConfigLoader();
			await loader.initialize({});

			expect(loader.path).toBe(join(directory, "script.lua"));
		} finally {
			process.chdir(cwd);
		}
	});
});
