import { log } from "@clack/prompts";
import Api from "@/api/scripting/index.js";
import { BaseCommand } from "@/shared/command.js";

export default class Logout extends BaseCommand {
	static override args = {};
	static override description = "Removes user session from scripting API";
	static override examples = ["<%= config.bin %> <%= command.id %>"];
	static override flags = {};

	public async run(): Promise<void> {
		await this.parse(Logout);

		if (Api.valid) {
			try {
				await Api.post("/auth/logout");
			} catch {}

			log.success(`Logged out from @${Api.user.name || Api.user.username}`);
		} else {
			log.warn("Already logged out");
		}

		Api.logout();
	}
}
