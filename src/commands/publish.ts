import { log } from "@clack/prompts";
import { Args, Flags } from "@oclif/core";
import Api from "@/api/scripting/index.js";
import config, { initializeConfig, resolvePath } from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { resolveScriptIdOrCreate } from "@/shared/scripts.js";
import ContentSet from "./content/set.js";

export default class Publish extends BaseCommand {
	static override args = {
		name: Args.string({
			name: "UUID or name",
			description: "Script UUID or name to set content for",
			required: false,
		}),
		path: Args.file({
			description: "Script file path",
			required: false,
			exists: true,
		}),
	};
	static override description =
		"Publish current script draft. Also updates script content if update flags is provided";
	static override examples = ["<%= config.bin %> <%= command.id %>"];
	static override flags = {
		update: Flags.boolean({
			name: "Update file",
			char: "u",
			description: "Reads script file and updates it's content before publish",
		}),
	};

	@RequireLogin
	public async run(): Promise<void> {
		const { args, flags } = await this.parse(Publish);
		await initializeConfig(flags.project);

		const name = args.name ?? config.name;
		if (name === undefined) throw new Error("Failed to resolve script name");

		const scriptId = await resolveScriptIdOrCreate(name);

		if (flags.update) {
			const path = resolvePath(args.path);
			log.step(`Updating from "${path}"`);
			ContentSet.setContent(path, name);
		}

		const { script_id } = await Api.post("/scripts/{scriptId}/publish", {
			params: { path: { scriptId } },
		});

		log.success(`Successfully published ${script_id}`);
	}
}
