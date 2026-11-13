import { box } from "@clack/prompts";
import Api from "@/api/scripting/index.js";
import config from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { formatCreateDate, formatPublishDate } from "@/shared/format.js";
import { findScript, resolveScript } from "@/shared/scripts.js";
import { clearScreen } from "@/shared/terminal.js";
import { isUuid } from "@/shared/uuid.js";

const PANEL_BG = "\x1b[48;2;20;23;31m";
const RESET = "\x1b[0m";
const TAB_WIDTH = 4;

function displayWidth(value: string): number {
	let width = 0;
	for (const char of value) {
		width += char === "\t" ? TAB_WIDTH : 1;
	}
	return width;
}

function renderContent(content: string): string {
	const columns = Math.max(1, process.stdout.columns ?? 80);

	return content
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => {
			const padding = " ".repeat(Math.max(0, columns - displayWidth(line)));
			return `${PANEL_BG}${line}${padding}${RESET}`;
		})
		.join("\n");
}

export default class ContentGet extends BaseCommand {
	static override args = {};
	static override description = "Get content of script";
	static override examples = [
		'<%= config.bin %> <%= command.id %> --id "minimap"',
	];

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(ContentGet);
		await config.initialize({ project: flags.project });

		const target = flags.id ?? config.id ?? config.name;
		if (target === undefined) {
			this.error(
				"Script UUID or name is required. Pass `--id` or set `id` in the config.",
			);
		}

		const summary = isUuid(target)
			? await resolveScript(target, "r")
			: await findScript(target);

		if (summary === undefined) {
			this.error(`Script "${target}" not found`);
		}

		clearScreen();

		box(
			[
				`UUID: ${summary.script_id}`,
				`Name: ${summary.name}`,
				`Description: ${summary.description ?? ""}`,
				`Created: ${formatCreateDate(summary.created_at)}`,
				`Updated: ${formatPublishDate(summary.updated_at)}`,
				`Published: ${formatPublishDate(summary.published_at)}`,
				`Author: ${summary.author_name}`,
				`Favorite: ${summary.is_favorite ? "Yes" : "No"}`,
			].join("\n"),
			"Description",
		);

		const { content } = await Api.get("/scripts/{scriptId}/content", {
			params: { path: { scriptId: summary.script_id } },
		});
		this.log(`\n${renderContent(content)}`);
	}
}
