import { Args, Flags } from "@oclif/core";
import Api from "@/api/scripting/index.js";
import config from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { resolveScriptIdOrCreate } from "@/shared/scripts.js";
import { SCRIPTING_URL } from "@/url.js";

export default class ContentSet extends BaseCommand {
	static override args = {
		content: Args.string({
			description: "Script content or filepath to set",
			required: true,
		}),
	};

	static override description = "Set script content";
	static override examples = [
		'<%= config.bin %> <%= command.id %> --id "My Hello World" "function tick() log(\'hello world\') end"',
	];

	static override flags = {
		id: Flags.string({
			name: "UUID or name",
			description: "Script UUID or name to set content for",
			required: false,
		}),
		open: Flags.boolean({
			name: "Open script",
			description: "Open friendly battle after content set",
			required: false,
		}),
	};

	protected async setContent(id: string, content: string) {
		const scriptId = await resolveScriptIdOrCreate(id, content);
		if (scriptId !== undefined) {
			await Api.put("/scripts/{scriptId}/content", {
				params: { path: { scriptId } },
				body: { content },
			});
		}

		return scriptId;
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { args, flags } = await this.parse(ContentSet);

		const name = flags.id ?? config.id;
		if (name === undefined) throw new Error("Failed to resolve script name");

		const scriptId = await this.setContent(name, args.content);

		if (!flags.open) {
			this.log(`Done`);
			this.log(`Website: ${SCRIPTING_URL}/scripts/${scriptId}`);
			return;
		}

		// const share = await
		// this.log(`Battle: ${buildBattleLink({ scriptId })}`);
	}
}
