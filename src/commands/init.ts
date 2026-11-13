import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	outro,
	select,
	text,
} from "@clack/prompts";
import { Flags } from "@oclif/core";
import { stringify } from "smol-toml";
import type { NbsConfig, NbsProcessConfig } from "@/config.js";
import { createAdbConfig } from "@/device/adb.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { readScriptContent } from "@/shared/content.js";
import {
	SCRIPT_DESCRIPTION_MAX,
	SCRIPT_DESCRIPTION_MIN,
	SCRIPT_NAME_MAX,
	SCRIPT_NAME_MIN,
} from "@/shared/metadata.js";
import { createScript } from "@/shared/scripts.js";
import Params from "./parameters.js";

const CONFIG_FILE = "nbsproject.toml";
const RC_FILE = ".nbsrc";

/** Asks a question and returns `undefined` when the user cancels */
async function ask(
	options: Parameters<typeof text>[0],
): Promise<string | undefined> {
	const answer = await text(options);

	if (isCancel(answer)) {
		cancel("Initialization cancelled");
		return undefined;
	}

	return answer;
}

export default class Init extends BaseCommand {
	static override args = {};
	static override description = `Create a ${CONFIG_FILE} config`;
	static override examples = ["<%= config.bin %> <%= command.id %>"];
	static override flags = {
		device: Flags.boolean({
			name: "device",
			description: "Initialize device config only",
		}),
	};

	private async setupCore() {
		const name = await ask({
			message: "Script name",
			placeholder: "My awesome script",
			validate: (value) => {
				const input = (value ?? "").trim();
				const length = input.length;

				if (length < SCRIPT_NAME_MIN || length > SCRIPT_NAME_MAX) {
					return `Name must be ${SCRIPT_NAME_MIN}-${SCRIPT_NAME_MAX} characters`;
				}

				return undefined;
			},
		});
		if (name === undefined) return;

		const description = await ask({
			message: "Description (leave empty to skip)",
			validate: (value) => {
				const input = (value ?? "").trim();
				const length = input.length;

				if (length === 0) return undefined;

				if (
					length < SCRIPT_DESCRIPTION_MIN ||
					length > SCRIPT_DESCRIPTION_MAX
				) {
					return `Description must be ${SCRIPT_DESCRIPTION_MIN}-${SCRIPT_DESCRIPTION_MAX} characters`;
				}

				return undefined;
			},
		});
		if (description === undefined) return;

		const path = await ask({
			message: "Script file path (leave empty to skip)",
			placeholder: "./script.lua",
			validate: (value) => {
				const input = (value ?? "").trim();

				if (input === "") return undefined;

				const absolute = resolve(input);
				if (!existsSync(absolute)) {
					return `File "${absolute}" does not exist`;
				}

				return undefined;
			},
		});
		if (path === undefined) return;

		const scriptName = name.trim();
		const scriptDescription = description.trim();
		const scriptPath = path.trim();

		const id = await createScript(
			{
				name: scriptName,
				...(scriptDescription === "" ? {} : { description: scriptDescription }),
			},
			scriptPath === "" ? undefined : readScriptContent(resolve(scriptPath)),
		);

		const project: NbsConfig & { id: string; name: string } = {
			id,
			name: scriptName,
		};

		if (scriptDescription !== "") {
			project.description = scriptDescription;
		}

		if (scriptPath !== "") {
			project.path = scriptPath;
		}

		return project;
	}

	private async setupDevice() {
		const filepath = resolve(RC_FILE);

		// Setting up device config
		// Save to separate (personal and hidden, by convention) .nbsrc file
		const device = await select({
			message: "Select device configuration",
			options: [
				{
					value: "none",
					label: "None",
					hint: "You won't be able to open your scripts directly from CLI",
				},
				{ value: "adb", label: "ADB", hint: "Android Debug Bridge" },
			],
		});

		if (isCancel(device) || device === "none") return;

		const adb = await createAdbConfig();
		if (adb === undefined) return;

		const config: Partial<NbsProcessConfig> = { adb };
		writeFileSync(filepath, stringify({ process: config }), {
			encoding: "utf8",
		});
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(Init);

		if (flags.device) {
			return await this.setupDevice();
		}

		intro("init");

		const filepath = resolve(CONFIG_FILE);
		if (existsSync(filepath)) {
			const overwrite = await confirm({
				message: `${CONFIG_FILE} already exists. Overwrite?`,
				initialValue: false,
			});

			if (isCancel(overwrite) || overwrite !== true) {
				cancel("Initialization cancelled");
				return;
			}
		}

		const project = await this.setupCore();
		if (project === undefined) return;

		const parameters = await confirm({
			message: "Want to setup script parameters?",
			initialValue: false,
		});

		if (!isCancel(parameters) && parameters) {
			const selected = await Params.selectParameters(project.id);
			if (selected.length > 0) {
				project.parameters = selected;
			}
		}

		await this.setupDevice();
		writeFileSync(filepath, stringify(project), { encoding: "utf8" });

		outro(`Created ${CONFIG_FILE} for script ${project.id}`);
	}
}
