import { isCancel, log, select, text } from "@clack/prompts";
import Api, { type ScriptParameter } from "@/api/scripting/index.js";
import config from "@/config.js";
import { RequireLogin } from "@/shared/auth.js";
import { BaseCommand } from "@/shared/command.js";
import type { BattleParameterValue } from "@/shared/deeplink.js";
import { clearScreen } from "@/shared/terminal.js";

async function selectBoolean(
	parameter: ScriptParameter,
): Promise<BattleParameterValue | undefined> {
	const TrueValue = { value: true, label: "True" };
	const FalseValue = { value: false, label: "False" };
	const value = await select({
		message: `Select "${parameter.name}" value.`,
		options: [TrueValue, FalseValue],
		initialValue: Boolean(parameter.default_value),
	});

	if (isCancel(value)) {
		return;
	}

	return {
		name: parameter.name,
		value,
	};
}

async function selectInteger(
	parameter: ScriptParameter,
): Promise<BattleParameterValue | undefined> {
	const range =
		parameter.max_value !== undefined && parameter.min_value !== undefined
			? `Acceptable range: ${parameter.min_value} - ${parameter.max_value}`
			: "";
	const value = await text({
		message: `Enter "${parameter.name}" value. ${range}`,
		defaultValue: parameter.default_value.toString(),
		validate: (value) => {
			const input = Number((value ?? "").trim());
			if (!Number.isFinite(input)) return "Invalid number input";
			if (!Number.isInteger(input)) return "Value must be an integer";

			if (parameter.max_value != null && input > parameter.max_value) {
				return `Number is too big. Parameter maximum is ${parameter.max_value}`;
			}

			if (parameter.min_value != null && input < parameter.min_value) {
				return `Number is too small. Parameter minimum is ${parameter.min_value}`;
			}

			return undefined;
		},
	});

	if (isCancel(value)) {
		return;
	}

	return {
		name: parameter.name,
		value: Number(value),
	};
}

export default class Parameters extends BaseCommand {
	static override aliases = ["params"];
	static override description = "Configure script parameters";
	static override examples = ["<%= config.bin %> <%= command.id %>"];

	static async selectParameters(
		scriptId: string,
	): Promise<BattleParameterValue[]> {
		const { parameters } = await Api.get("/scripts/{scriptId}/parameters", {
			params: { path: { scriptId } },
		});

		// Store in map to avoid duplicates
		const changes: Map<string, BattleParameterValue> = new Map();
		config.parameters?.forEach((value) => {
			changes.set(value.name, value);
		});

		if (parameters.length === 0) {
			log.info("This script has no configurable parameters.");
			return Array.from(changes.values());
		}

		let lastValue: ScriptParameter | undefined;
		while (true) {
			clearScreen();

			const selection = await select({
				message: "Pick a parameter to change (cancel to finish)",
				options: parameters.map((param) => {
					return { value: param, label: param.name, hint: param.type };
				}),
				initialValue: lastValue,
			});

			clearScreen();
			if (isCancel(selection)) {
				break;
			}

			let change: BattleParameterValue | undefined;
			switch (selection.type) {
				case "bool":
					change = await selectBoolean(selection);
					break;
				case "int":
					change = await selectInteger(selection);
					break;
			}

			if (change !== undefined) changes.set(selection.name, change);
			lastValue = selection;
		}

		clearScreen();
		return Array.from(changes.values());
	}

	@RequireLogin
	public async run(): Promise<void> {
		const { flags } = await this.parse(Parameters);
		await config.initialize(flags);
		await config.ensureWritable();

		const parameters = await Parameters.selectParameters(config.id);
		await config.patch({ parameters });
	}
}
