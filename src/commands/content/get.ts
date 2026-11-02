import { box } from "@clack/prompts";
import { Flags } from "@oclif/core";
import Api, { type ScriptSummary } from "@/api/scripting/index.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import { formatCreateDate, formatPublishDate } from "@/shared/format.js";
import { findScript } from "@/shared/scripts.js";
import { clearScreen } from "@/shared/terminal.js";

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
		'<%= config.bin %> <%= command.id %> -n "hello World"',
	];
	static override flags = {
		name: Flags.string({
			char: "n",
			name: "name",
			required: false,
			description: "Script name to get content from",
		}),

		uuid: Flags.string({
			char: "u",
			name: "uuid",
			required: false,
			description: "Script uuid to get content from",
		}),
	};

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(ContentGet);

		let uuid = flags.uuid;
		let summary: ScriptSummary | undefined;
		if (flags.name !== undefined) {
			summary = await findScript(flags.name);
			uuid = summary?.script_id;
		}

		clearScreen();
		if (uuid === undefined) {
			this.error("UUID or name is required to get script content");
		}

		if (summary === undefined) {
			summary = await Api.get("/scripts/{scriptId}", {
				params: { path: { scriptId: uuid } },
			});
		}

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
			params: { path: { scriptId: uuid } },
		});
		this.log(`\n${renderContent(content)}`);
	}
}
