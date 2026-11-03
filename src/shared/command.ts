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
	};

	protected override async catch(err: Interfaces.CommandError): Promise<void> {
		const report = describeError(err);

		// Not ours (parse error, this.error(), bug) or a JSON consumer that
		// needs the structured error: let oclif handle it
		if (!report || this.jsonEnabled()) return super.catch(err);

		for (const line of report.lines) this.logToStderr(line);
		process.exitCode = report.exitCode;
	}
}
