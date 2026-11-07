import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { log, spinner } from "@clack/prompts";
import { Args, Flags } from "@oclif/core";
import watcher from "@parcel/watcher";
import Api from "@/api/scripting/index.js";
import config, { initializeConfig, resolvePath } from "@/config.js";
import device from "@/device/index.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { buildBattleLink } from "@/shared/deeplink.js";
import { resolveScriptIdOrCreate } from "@/shared/scripts.js";
import { clearScreen } from "@/shared/terminal.js";

export default class ContentSet extends BaseCommand {
	static override args = {
		path: Args.file({
			description: "Script file path",
			required: false,
			exists: true,
		}),
	};

	static override description = "Set script content";
	static override examples = [
		'<%= config.bin %> <%= command.id %> --id "My Hello World" "function tick() log(\'hello world\') end"',
	];

	static override flags = {
		name: Flags.string({
			name: "UUID or name",
			description: "Script UUID or name to set content for",
			required: false,
		}),
		watch: Flags.boolean({
			name: "Watch for file changes",
			char: "w",
			description: "Watch and update script when file changed ",
			required: false,
		}),
		open: Flags.boolean({
			name: "Open script",
			char: "o",
			description: "Opens script on device after uploading or changes",
			required: false,
		}),
	};

	private scriptId!: string;

	static async setContent(path: string, id: string) {
		let content = readFileSync(path, { encoding: "utf8" });
		content = content.replace(/^\uFEFF/, "");

		const scriptId = await resolveScriptIdOrCreate(id, content);
		if (scriptId !== undefined) {
			await Api.put("/scripts/{scriptId}/content", {
				params: { path: { scriptId } },
				body: { content },
			});
		}

		return scriptId;
	}

	protected async openScript() {
		clearScreen();
		const url = await buildBattleLink({
			scriptId: this.scriptId,
			parameters: config.parameters ?? [],
		});

		await device.openUrl(url);
		clearScreen();
	}

	private async startWatch(name: string, path: string, open: boolean) {
		const spin = spinner();
		spin.start("Running device...");
		await device.ensureDevice();

		spin.message("Watching for file changes...");
		watcher.subscribe(dirname(path), async (error, events) => {
			if (error) throw error;

			for (const event of events) {
				if (event.path !== path) continue;
				if (event.type === "delete") continue;

				spin.message("Found changes. Updating...");
				await ContentSet.setContent(event.path, name);
				if (open) this.openScript();
				spin.message("Continue watching...");
			}
		});

		if (open) {
			while (true) {
				const running = await device.ensureNullsRunning();

				if (!running) {
					spin.message("Application is not running, reloading...");
					await this.openScript();
					spin.message("Continue watching...");
				}

				await new Promise((resolve) => setTimeout(resolve, 1500));
			}
		}
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { args, flags } = await this.parse(ContentSet);
		initializeConfig(flags.project);

		const name = flags.name ?? config.name;
		if (name === undefined) {
			this.error("Failed to resolve script name");
		}

		const path = resolvePath(args.path);
		log.step(`Updating from "${path}"`);

		this.scriptId = await ContentSet.setContent(path, name);
		if (flags.watch) {
			await this.startWatch(name, path, flags.open);
		} else if (flags.open) {
			await device.ensureDevice();
			await this.openScript();
		}
	}
}
