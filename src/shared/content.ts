import { readFileSync } from "node:fs";
import Api from "@/api/scripting/index.js";

/** Reads script source, stripping a UTF-8 BOM */
export function readScriptContent(path: string): string {
	return readFileSync(path, { encoding: "utf8" }).replace(/^\uFEFF/, "");
}

/** Uploads the file at `path` as the script draft content */
export async function setScriptContent(
	path: string,
	scriptId: string,
): Promise<string> {
	await Api.put("/scripts/{scriptId}/content", {
		params: { path: { scriptId } },
		body: { content: readScriptContent(path) },
	});

	return scriptId;
}
