import { isCancel, select } from "@clack/prompts";
import validUUID from "uuid-validate";
import Api, {
	ScriptingAPIError,
	type ScriptSummary,
} from "@/api/scripting/index.js";

export enum ScriptFiltering {
	None,
	Author,
}

export async function findScript(
	name: string,
	filtering: ScriptFiltering = ScriptFiltering.None,
	silent: boolean = false,
): Promise<ScriptSummary | undefined> {
	let scripts: ScriptSummary[];
	if (filtering === ScriptFiltering.Author) {
		const response = await Api.get("/users/{userId}/scripts", {
			params: { path: { userId: Api.user.uuid } },
		});
		scripts = response.scripts;
	} else {
		const response = await Api.get("/scripts");
		scripts = response.scripts;
	}

	const filtered = scripts.filter((summary) => {
		return summary.name.includes(name);
	});

	if (filtered.length === 0) return undefined;
	if (filtered.length === 1 || silent) return filtered[0];
	if (filtered.length > 10) {
		throw new Error("Too many scripts found! Try to clarify your request");
	}

	const selected = (await select({
		message: "Found multiple scripts. Please select one",
		options: filtered.map((summary) => {
			return {
				value: summary.script_id,
				label: summary.name,
				hint: summary.author_name,
			};
		}),
	})) as string;

	if (isCancel(selected)) {
		return filtered[0];
	}

	return filtered.find((summary) => summary.script_id === selected);
}

export async function resolveScriptId(
	id: string,
	mode: "rw" | "r" | "w",
): Promise<ScriptSummary | undefined> {
	const writeAccess = mode.includes("w");
	const readAccess = mode.includes("r");

	let target: ScriptSummary | undefined;
	if (validUUID(id)) {
		try {
			target = await Api.get("/scripts/{scriptId}", {
				params: { path: { scriptId: id } },
			});
		} catch (error) {
			if (error instanceof ScriptingAPIError && error.status === 404) {
				// Most likely script either is draft or doesn't exist -> cannot read
				return undefined;
			}

			throw error;
		}

		if (writeAccess && target !== undefined) {
			if (target.author_uuid !== Api.user.uuid) {
				throw new Error("You don't have access to this script!");
			}
		}

		return target;
	}

	// Search only for author scripts if request write
	// Only author of scripts could write to scripts
	target = await findScript(
		id,
		readAccess ? ScriptFiltering.None : ScriptFiltering.Author,
		true,
	);

	return target;
}

export async function resolveScriptIdOrCreate(
	id: string,
	content?: string,
): Promise<string> {
	const target = await resolveScriptId(id, "w");

	if (validUUID(id) && target === undefined) {
		throw new Error(`You do not have access to script by UUID ${id}`);
	}

	if (target === undefined) {
		const { script_id } = await Api.post("/scripts", {
			body: { name: id, content: content ?? "" },
		});
		return script_id;
	}

	return target.script_id;
}
