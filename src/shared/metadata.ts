import Api from "@/api/scripting/index.js";
import type { NbsConfig } from "@/config.js";
import { UsageError } from "@/errors.js";

/** Script name limits enforced by the scripting API */
export const SCRIPT_NAME_MIN = 3;
export const SCRIPT_NAME_MAX = 32;

/** Script description limits enforced by the scripting API */
export const SCRIPT_DESCRIPTION_MIN = 32;
export const SCRIPT_DESCRIPTION_MAX = 1024;

/** Fields to write. Omitted fields are left untouched */
export interface ScriptMetadata {
	name?: string;

	/** `null` clears the description */
	description?: string | null;
}

/** Builds metadata from the project config. An empty description clears the field */
export function metadataFromConfig(config: NbsConfig): ScriptMetadata {
	const metadata: ScriptMetadata = {};

	if (config.name !== undefined) {
		metadata.name = config.name;
	}

	if (config.description !== undefined) {
		metadata.description =
			config.description.trim() === "" ? null : config.description;
	}

	return metadata;
}

/** Throws when metadata cannot be accepted by the scripting API */
export function validateMetadata(metadata: ScriptMetadata): void {
	const problems: string[] = [];

	if (metadata.name !== undefined) {
		const length = metadata.name.length;
		if (length < SCRIPT_NAME_MIN || length > SCRIPT_NAME_MAX) {
			problems.push(
				`name must be ${SCRIPT_NAME_MIN}-${SCRIPT_NAME_MAX} characters, got ${length}`,
			);
		}
	}

	if (metadata.description !== undefined && metadata.description !== null) {
		const length = metadata.description.length;
		if (length < SCRIPT_DESCRIPTION_MIN || length > SCRIPT_DESCRIPTION_MAX) {
			problems.push(
				`description must be ${SCRIPT_DESCRIPTION_MIN}-${SCRIPT_DESCRIPTION_MAX} characters, got ${length}`,
			);
		}
	}

	if (problems.length > 0) {
		throw new UsageError(
			`Invalid script metadata:\n- ${problems.join("\n- ")}`,
		);
	}
}

/** Applies metadata to the script */
export async function applyMetadata(
	scriptId: string,
	metadata: ScriptMetadata,
): Promise<void> {
	if (metadata.name !== undefined) {
		await Api.put("/scripts/{scriptId}/name", {
			params: { path: { scriptId } },
			body: { name: metadata.name },
		});
	}

	if (metadata.description === null) {
		await Api.delete("/scripts/{scriptId}/description", {
			params: { path: { scriptId } },
		});
	} else if (metadata.description !== undefined) {
		await Api.put("/scripts/{scriptId}/description", {
			params: { path: { scriptId } },
			body: { description: metadata.description },
		});
	}
}
