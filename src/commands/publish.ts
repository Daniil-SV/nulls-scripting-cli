import { log } from "@clack/prompts";
import Api from "@/api/scripting/index.js";
import config from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";

export default class Publish extends BaseCommand {
	static override description = "Publish current script draft";
	static override examples = ["<%= config.bin %> <%= command.id %>"];

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(Publish);
		await config.initialize(flags);
		await config.ensureWritable();

		const { script_id } = await Api.post("/scripts/{scriptId}/publish", {
			params: { path: { scriptId: config.id } },
		});

		log.success(`Successfully published ${script_id}`);
	}
}
