import { box } from "@clack/prompts";
import { Flags } from "@oclif/core";
import Api from "@/api/scripting/index.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";

export default class Whoami extends BaseCommand {
	static override args = {};
	static override description = "Prints logged in user info";
	static override flags = {
		json: Flags.boolean({
			name: "json",
			char: "j",
			description: "Prints serialized json of user info",
		}),
		uuid: Flags.string({
			name: "UUID",
			char: "u",
			description: "Other's user UUID to get profile from",
			required: false,
		}),
		script_uuid: Flags.string({
			name: "Script UUID",
			char: "s",
			description:
				"UUID of script to get author from and display author's profile",
			required: false,
		}),
	};

	static override examples = [
		"<%= config.bin %> <%= command.id %> -s 01a00bce-0b9a-75ea-821c-049a436553a0",
		"<%= config.bin %> <%= command.id %> -u ad6e6c3e-a213-4657-8083-f8c5a433dc71",
	];

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(Whoami);

		let targetUuid: string = "me";
		if (flags.script_uuid !== undefined) {
			const script = await Api.get("/scripts/{scriptId}", {
				params: { path: { scriptId: flags.script_uuid } },
			});
			targetUuid = script.author_uuid;
		} else if (flags.uuid !== undefined) {
			targetUuid = flags.uuid;
		}

		const user = await Api.get("/users/{userId}", {
			params: { path: { userId: targetUuid } },
		});

		const { scripts } = await Api.get("/users/{userId}/scripts", {
			params: { path: { userId: user.user_id } },
		});

		if (flags.json) return this.logJson(user);

		const info = [`UUID: ${user.user_id}`];

		if ("has_password" in user) {
			info.push(`Password set: ${user.has_password ? "yes" : "no"}`);
		}

		if ("has_connect_email" in user) {
			info.push(
				`Nulls Connect linked: ${user.has_connect_email ? "yes" : "no"}`,
			);
		}

		info.push(`Total scripts count: ${scripts.length}`);

		const published = scripts
			.filter((value) => value.published_at !== null)
			.sort((a, b) => {
				return new Date(a.published_at as string) >
					new Date(b.published_at as string)
					? 1
					: 0;
			});

		if (published.length > 0) {
			const names = published
				.slice(0, Math.min(10, published.length))
				.map((value) => `	- ${value.name}`);
			info.push(`Last published scripts: \n${names.join("\n")}`);
		}

		box(info.join("\n"), `${user.name} (@${user.username})`);
	}
}
