import { log } from "@clack/prompts";
import { Flags } from "@oclif/core";
import config from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import {
	applyMetadata,
	metadataFromConfig,
	validateMetadata,
} from "@/shared/metadata.js";

export default class Sync extends BaseCommand {
	static override args = {};
	static override description = "Apply script metadata from the project config";
	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --dry-run",
	];
	static override flags = {
		"dry-run": Flags.boolean({
			description: "Show planned changes without applying them",
		}),
		json: Flags.boolean({ description: "Print raw JSON and exit" }),
	};

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(Sync);
		await config.initialize(flags);
		if (!flags["dry-run"]) await config.ensureWritable();

		const metadata = metadataFromConfig(config);

		if (metadata.name === undefined && metadata.description === undefined) {
			this.error("Config has no name or description to sync");
		}

		validateMetadata(metadata);

		const applied = !flags["dry-run"];
		if (applied) {
			await applyMetadata(config.id, metadata);
		}

		if (flags.json) {
			this.logJson({ scriptId: config.id, metadata, applied });
			return;
		}

		if (metadata.name !== undefined) {
			log.step(`name: "${metadata.name}"`);
		}

		if (metadata.description === null) {
			log.step("description: <clear>");
		} else if (metadata.description !== undefined) {
			log.step(`description: "${metadata.description}"`);
		}

		if (flags["dry-run"]) {
			log.info("Dry run: nothing applied");
			return;
		}

		log.success(`Synced metadata for ${config.id}`);
	}
}
