import { type ExecFileOptions, execFile } from "node:child_process";
import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface FindInstallOptions {
	/** Additional names to search for */
	aliases?: string[];

	/** Additional directories to search */
	directories?: string[];

	/** Maximum directory depth to scan, relative to each search root */
	depth?: number;

	/** Whether to search standard platform directories (default: true) */
	searchDirectories?: boolean;
}

/** Runs a command without opening a console window on Windows */
export function execFileAsync(
	file: string,
	args: readonly string[],
	options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			file,
			args as string[],
			{ encoding: "utf8", windowsHide: true, ...options },
			(error, stdout, stderr) => {
				if (error !== null) {
					reject(error);
					return;
				}

				resolvePromise({
					stdout: String(stdout),
					stderr: String(stderr),
				});
			},
		);
	});
}

function normalizeName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Matches a directory or product name against the requested names.
 *
 * Names are compared without separators so `MuMuPlayer`, `MuMuPlayer-12.0`
 * and `MuMuPlayer 12` are considered the same product. A trailing version is
 * allowed, but unrelated names that only share a prefix are not.
 */
export function matchesName(value: string, names: readonly string[]): boolean {
	const name = normalizeName(value);
	if (name === "") return false;

	return names.some((candidate) => {
		const normalized = normalizeName(candidate);
		if (normalized === "") return false;
		if (name === normalized) return true;
		if (!name.startsWith(normalized)) return false;

		const next = name.charAt(normalized.length);
		return next !== "" && !/[a-z]/.test(next);
	});
}

function unique(paths: string[]): string[] {
	const seen = new Set<string>();
	const results: string[] = [];

	for (const path of paths) {
		const absolute = resolve(path);
		const key =
			process.platform === "win32" ? absolute.toLowerCase() : absolute;
		if (seen.has(key)) continue;

		seen.add(key);
		results.push(absolute);
	}

	return results;
}

function directoryName(name: string): string {
	// App bundles are directories, but their `.app` extension is not a product name
	return name.endsWith(".app") ? name.slice(0, -4) : name;
}

function isDirectory(path: string, entry: Dirent): boolean {
	if (entry.isDirectory()) return true;
	if (!entry.isSymbolicLink()) return false;

	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function scanDirectory(
	root: string,
	names: readonly string[],
	depth: number,
	results: string[],
): void {
	if (depth < 0 || !existsSync(root)) return;

	let entries: Dirent[];
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const fullPath = join(root, entry.name);
		if (!isDirectory(fullPath, entry)) continue;

		if (matchesName(directoryName(entry.name), names)) {
			results.push(fullPath);

			// Application bundles are leaf products, so don't scan inside them
			if (entry.name.endsWith(".app")) continue;
		}

		// Vendor folders may contain the actual installation one level deeper
		if (depth > 0) {
			scanDirectory(fullPath, names, depth - 1, results);
		}
	}
}

function registryValue(value: string): string {
	return value.trim().replace(/^"(.*)"$/, "$1");
}

async function searchWindowsRegistry(
	names: readonly string[],
): Promise<string[]> {
	const keys = [
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
		"HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
		"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
	];

	const results: string[] = [];

	for (const key of keys) {
		try {
			const { stdout } = await execFileAsync("reg", ["query", key, "/s"], {
				maxBuffer: 16 * 1024 * 1024,
				timeout: 10_000,
			});

			const blocks = stdout.split(/\r?\n(?=HKEY_)/i);

			for (const block of blocks) {
				const displayName = block
					.match(/^\s*(?:Quiet)?DisplayName\s+REG_SZ\s+(.+)$/im)?.[1]
					?.trim();

				if (displayName === undefined || !matchesName(displayName, names)) {
					continue;
				}

				const installLocation = block
					.match(/^\s*InstallLocation\s+REG_SZ\s+(.+)$/im)?.[1]
					?.trim();

				if (installLocation !== undefined) {
					const location = registryValue(installLocation);
					if (existsSync(location)) results.push(location);
				}
			}
		} catch {
			// The registry key may not exist or may be inaccessible
		}
	}

	return results;
}

function platformDirectories(): string[] {
	switch (process.platform) {
		case "win32":
			return [
				process.env["ProgramFiles"],
				process.env["ProgramFiles(x86)"],
				process.env["ProgramW6432"],
				process.env["LOCALAPPDATA"],
				process.env["APPDATA"],
			].filter((value): value is string => value !== undefined);

		case "darwin":
			return [
				"/Applications",
				"/System/Applications",
				join(homedir(), "Applications"),
			];

		case "linux":
			return [
				"/opt",
				"/usr/local",
				"/usr/lib",
				"/usr/share",
				join(homedir(), ".local/share"),
				join(homedir(), ".local/lib"),
				join(homedir(), "Applications"),
				join(homedir(), "apps"),
			];

		default:
			return [];
	}
}

/**
 * Searches for an installed application by name.
 *
 * Returns absolute paths to matching directories. Windows registry entries are
 * checked first, then the standard install directories are scanned. Callers
 * should still verify the expected executable layout inside each result.
 */
export async function findInstallLocation(
	packageName: string,
	options: FindInstallOptions = {},
): Promise<string[]> {
	const names = [packageName, ...(options.aliases ?? [])];
	const results: string[] = [];

	if (process.platform === "win32") {
		results.push(...(await searchWindowsRegistry(names)));
	}

	if (options.searchDirectories !== false) {
		const roots = [...platformDirectories(), ...(options.directories ?? [])];
		const depth = options.depth ?? (process.platform === "darwin" ? 1 : 2);

		for (const root of unique(roots)) {
			scanDirectory(root, names, depth, results);
		}
	} else if (options.directories !== undefined) {
		for (const root of unique(options.directories)) {
			scanDirectory(root, names, options.depth ?? 1, results);
		}
	}

	return unique(results);
}
