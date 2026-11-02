import { ConnectError } from "@/api/connect/index.js";
import { ScriptingAPIError } from "@/api/scripting/index.js";
import { LoginError } from "@/shared/auth.js";
import { DeeplinkError } from "@/shared/deeplink.js";

/** Bad usage (missing argument, unknown command, invalid flag value). Exit code 2. */
export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

export interface ErrorReport {
	/** Process exit code */
	exitCode: number;

	/** Lines to print to stderr */
	lines: string[];
}

/**
 * Maps a domain error to user-facing output. Returns `undefined` for errors oclif
 * should handle itself (parse errors, `this.error()`, unexpected crashes).
 */
export function describeError(error: unknown): ErrorReport | undefined {
	if (error instanceof UsageError) {
		return { exitCode: 2, lines: [error.message] };
	}

	if (error instanceof LoginError) {
		return { exitCode: 1, lines: [error.message] };
	}

	if (error instanceof ConnectError) {
		return { exitCode: 1, lines: [`Login failed: ${error.message}`] };
	}

	if (error instanceof DeeplinkError) {
		return { exitCode: 1, lines: [`Battle creation error: ${error.message}`] };
	}

	if (error instanceof ScriptingAPIError) {
		const lines = [`Request failed. ${error.message}`];

		if (error.isLikelyQuotaExceeded) {
			lines.push(
				"The server returned 400 with an empty body. It uses that for its publish/share rate limit — wait a few minutes and retry.",
			);
		}

		if (error.status === 401) {
			lines.push("Your session may have expired or invalid");
		}

		return { exitCode: 1, lines };
	}

	return undefined;
}
