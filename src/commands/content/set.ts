import { basename, dirname } from "node:path";
import { log, spinner } from "@clack/prompts";
import { Flags } from "@oclif/core";
import watcher from "@parcel/watcher";
import config from "@/config.js";
import device from "@/device/index.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { setScriptContent } from "@/shared/content.js";
import { buildBattleLink } from "@/shared/deeplink.js";
import { clearScreen } from "@/shared/terminal.js";

export default class ContentSet extends BaseCommand {
	static override description = "Set script content";
	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		'<%= config.bin %> <%= command.id %> --id "My Hello World" --path ./script.luau',
		"<%= config.bin %> <%= command.id %> --watch --open",
	];

	static override flags = {
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

	protected async openScript(silent = false) {
		if (!silent) clearScreen();

		const url = await buildBattleLink({
			scriptId: this.scriptId,
			parameters: config.parameters ?? [],
		});

		await device.openUrl(url, silent);

		if (!silent) clearScreen();
	}

	private async startWatch(scriptId: string, path: string, open: boolean) {
		const spin = spinner();
		const name = basename(path);
		let lastUpdate: string | undefined;

		const showWatching = () => {
			spin.message(
				lastUpdate === undefined
					? `Watching ${name}...`
					: `Watching ${name} · updated ${lastUpdate}`,
			);
		};

		// Device initialization
		if (open) {
			spin.start("Preparing device...");

			try {
				await device.ensureDevice(true);
			} catch (error) {
				spin.error(`Device setup failed: ${(error as Error).message}`);
				throw error;
			}
		} else {
			spin.start(`Watching ${name}...`);
		}

		// File events can arrive faster than an upload + intent finishes, so
		// process them one at a time instead of interleaving spinner updates
		let queue = Promise.resolve();

		const update = async () => {
			spin.message(`Change detected · uploading ${name}...`);

			try {
				await setScriptContent(path, scriptId);
				lastUpdate = new Date().toLocaleTimeString();

				if (open) {
					spin.message("Opening script on device...");
					await this.openScript(true);
				}

				showWatching();
			} catch (error) {
				spin.message(`Update failed: ${(error as Error).message}`);
			}
		};

		watcher.subscribe(dirname(path), (error, events) => {
			if (error) {
				spin.message(`Watcher error: ${error.message}`);
				return;
			}

			const changed = events.some(
				(event) => event.path === path && event.type !== "delete",
			);
			if (!changed) return;

			queue = queue.then(update);
		});

		showWatching();

		if (!open) return;

		while (true) {
			try {
				const running = await device.ensureNullsRunning();
				if (!running) {
					spin.message("Nulls is not running · launching...");
					await this.openScript(true);
					showWatching();
				}
			} catch (error) {
				spin.message(`Device check failed: ${(error as Error).message}`);
			}

			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(ContentSet);
		await config.initialize(flags);
		await config.ensureWritable();

		if (config.path === undefined) {
			this.error(
				"Script path is not configured. Set `path` in the config or pass `--path`.",
			);
		}

		log.step(`Updating from "${config.path}"`);

		this.scriptId = await setScriptContent(config.path, config.id);
		if (flags.watch) {
			await this.startWatch(config.id, config.path, flags.open);
		} else if (flags.open) {
			await device.ensureDevice();
			await this.openScript();
		}
	}
}
