import { Command, Flags, type Interfaces } from "@oclif/core";
import { describeError } from "@/errors.js";

export abstract class BaseCommand extends Command {
	static override baseFlags = {
		project: Flags.string({
			char: "p",
			description: "Path to the project configuration",
			required: false,
			helpGroup: "GLOBAL",
		}),

		id: Flags.string({
			name: "UUID or name",
			description: "Target script UUID or name",
			required: false,
		}),

		path: Flags.file({
			description: "Script file path",
			required: false,
			exists: true,
		}),
	};

	protected override async catch(err: Interfaces.CommandError): Promise<void> {
		if (process.env["NODE_ENV"] === "development") {
			// Rethrow so we can get full stacktrace
			throw err;
		}

		const report = describeError(err);

		// Not ours (parse error, this.error(), bug) or a JSON consumer that
		// needs the structured error: let oclif handle it
		if (!report || this.jsonEnabled()) return super.catch(err);

		for (const line of report.lines) this.logToStderr(line);
		process.exitCode = report.exitCode;
	}
}
