import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isCancel, log, select, spinner, text } from "@clack/prompts";
import type { NbsAndroidDebugBridge } from "@/config.js";
import { execFileAsync, findInstallLocation } from "@/shared/platform.js";

const BOOT_TIMEOUT_MS = 120_000;
const BOOT_POLL_INTERVAL_MS = 1_000;

interface MuMuInstance {
	index: string;
	name: string;
	androidVersion?: string;
	playerState?: string;
	androidStarted: boolean;
	adbHost?: string;
	adbPort?: number;
}

interface MuMuLayout {
	/** Command used for info/adb calls */
	cli: string;

	/** Command spawned to launch an instance */
	command: string;

	infoArgs: (index?: string) => string[];
	launchArgs: (index: string) => string[];
	adbArgs?: (index: string) => string[];
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value !== "") return value;
	}

	return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
	for (const value of values) {
		const number =
			typeof value === "number"
				? value
				: typeof value === "string"
					? Number(value)
					: Number.NaN;

		if (Number.isFinite(number)) return number;
	}

	return undefined;
}

function assertSuccess(result: unknown): void {
	if (result === null || typeof result !== "object" || Array.isArray(result)) {
		return;
	}

	const record = result as Record<string, unknown>;
	const code = record["errcode"];

	// Some versions report the code as a string
	if (code !== undefined && code !== 0 && code !== "0") {
		throw new Error(
			`MuMuPlayer CLI error: ${String(record["errmsg"] ?? code)}`,
		);
	}
}

async function executeCli(target: string, args: string[]): Promise<unknown> {
	const { stdout, stderr } = await execFileAsync(target, args, {
		maxBuffer: 16 * 1024 * 1024,
		timeout: 30_000,
	});

	const output = stdout.trim();
	if (output === "") {
		if (stderr.trim() !== "") {
			throw new Error(`MuMuPlayer CLI error: ${stderr.trim()}`);
		}

		return {};
	}

	let result: unknown;
	try {
		result = JSON.parse(output);
	} catch {
		throw new Error(
			`Unexpected MuMuPlayer CLI output: ${output.slice(0, 300)}`,
		);
	}

	assertSuccess(result);
	return result;
}

function toInstance(value: unknown): MuMuInstance | undefined {
	if (value === null || typeof value !== "object") return undefined;

	const record = value as Record<string, unknown>;
	const rawIndex = record["index"] ?? record["vmindex"] ?? record["vm_index"];
	if (rawIndex === undefined || rawIndex === null) return undefined;

	const index = String(rawIndex);

	return {
		index,
		name:
			firstString(record["name"], record["vmName"], record["vm_name"]) ??
			`Instance ${index}`,
		androidVersion: firstString(
			record["android_version"],
			record["androidVersion"],
		),
		playerState: firstString(record["player_state"], record["playerState"]),
		androidStarted: record["is_android_started"] === true,
		adbHost: firstString(
			record["adb_host_ip"],
			record["adb_host"],
			record["host"],
		),
		adbPort: firstNumber(
			record["adb_port"],
			record["adbPort"],
			record["port"],
			record["customAdbPort"],
		),
	};
}

function instancesFrom(info: unknown): MuMuInstance[] {
	if (Array.isArray(info)) {
		return info
			.map(toInstance)
			.filter((instance): instance is MuMuInstance => instance !== undefined);
	}

	if (info === null || typeof info !== "object") return [];

	const record = info as Record<string, unknown>;
	if (record["index"] !== undefined) {
		const instance = toInstance(record);
		return instance === undefined ? [] : [instance];
	}

	return Object.values(record)
		.map(toInstance)
		.filter((instance): instance is MuMuInstance => instance !== undefined);
}

async function readInfo(layout: MuMuLayout, index?: string): Promise<unknown> {
	return await executeCli(layout.cli, layout.infoArgs(index));
}

async function readInstance(
	layout: MuMuLayout,
	index: string,
): Promise<MuMuInstance | undefined> {
	return instancesFrom(await readInfo(layout, index))[0];
}

function resolveWindowsLayout(root: string): MuMuLayout | undefined {
	const directories = [join(root, "nx_main"), join(root, "shell"), root];
	const find = (name: string): string | undefined =>
		directories.map((directory) => join(directory, name)).find(existsSync);

	const cli = find("MuMuManager.exe") ?? find("mumu-cli.exe");
	if (cli === undefined) return undefined;

	return {
		cli,
		command: cli,
		infoArgs: (index) => ["info", "-v", index ?? "all"],
		launchArgs: (index) => ["control", "-v", index, "launch"],
		adbArgs: (index) => ["adb", "-v", index],
	};
}

function resolveDarwinLayout(root: string): MuMuLayout | undefined {
	const macos =
		basename(root) === "MacOS" && basename(dirname(root)) === "Contents"
			? root
			: join(root, "Contents", "MacOS");

	const cli = ["mumutool", "mumu-cli"]
		.map((name) => join(macos, name))
		.find(existsSync);

	if (cli === undefined) return undefined;

	return {
		cli,
		command: cli,
		infoArgs: (index) => ["info", index ?? "all"],
		launchArgs: (index) => ["open", index],
	};
}

function resolveLayout(root: string): MuMuLayout | undefined {
	switch (process.platform) {
		case "win32":
			return resolveWindowsLayout(root);

		case "darwin":
			return resolveDarwinLayout(root);

		default:
			return undefined;
	}
}

async function locateMuMu(): Promise<
	{ root: string; layout: MuMuLayout } | undefined
> {
	const candidates = await findInstallLocation("MuMuPlayer", {
		aliases: ["MuMuPlayer Pro", "MuMuPlayerPro"],
	});

	for (const candidate of candidates) {
		const layout = resolveLayout(candidate);
		if (layout !== undefined) return { root: candidate, layout };
	}

	return undefined;
}

async function locateMuMuInteractive(): Promise<
	{ root: string; layout: MuMuLayout } | undefined
> {
	const spin = spinner();
	spin.start("Searching for MuMuPlayer installations...");

	let located = await locateMuMu();
	if (located === undefined) {
		spin.error("MuMuPlayer not found");
	} else {
		spin.stop(`Found MuMuPlayer: ${located.root}`);
	}

	while (located === undefined) {
		const answer = await text({
			message: "Enter MuMuPlayer installation path (leave empty to cancel)",
			validate: (value) => {
				const input = (value ?? "").trim();
				if (input === "") return undefined;

				return resolveLayout(input) === undefined
					? "MuMuPlayer CLI was not found in this path"
					: undefined;
			},
		});

		if (isCancel(answer) || answer.trim() === "") return undefined;

		const root = resolve(answer.trim());
		const layout = resolveLayout(root);
		if (layout !== undefined) located = { root, layout };
	}

	return located;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolvePromise) => {
		setTimeout(resolvePromise, milliseconds);
	});
}

async function launchInstance(
	layout: MuMuLayout,
	index: string,
): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn(layout.command, layout.launchArgs(index), {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		});

		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolvePromise();
		});
	});
}

async function waitForBoot(
	layout: MuMuLayout,
	index: string,
	spin: ReturnType<typeof spinner>,
): Promise<MuMuInstance> {
	const deadline = Date.now() + BOOT_TIMEOUT_MS;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const instance = await readInstance(layout, index);
			if (
				instance !== undefined &&
				(instance.androidStarted ||
					instance.playerState === "start_finished" ||
					instance.playerState === "running")
			) {
				return instance;
			}
		} catch (error) {
			lastError = error;
		}

		spin.message("Waiting for instance to finish boot up...");
		await delay(BOOT_POLL_INTERVAL_MS);
	}

	const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";

	throw new Error(
		`Timed out waiting for MuMuPlayer instance ${index} to boot${suffix}`,
	);
}

async function readAdb(
	layout: MuMuLayout,
	index: string,
	instance: MuMuInstance,
): Promise<{ host: string; port: number }> {
	let host = instance.adbHost ?? "127.0.0.1";
	let port = instance.adbPort;

	if (port === undefined && layout.adbArgs !== undefined) {
		const result = await executeCli(layout.cli, layout.adbArgs(index));
		const record =
			result !== null && typeof result === "object"
				? (result as Record<string, unknown>)
				: {};

		host =
			firstString(record["adb_host_ip"], record["adb_host"], record["host"]) ??
			host;
		port =
			firstNumber(
				record["adb_port"],
				record["adbPort"],
				record["port"],
				record["customAdbPort"],
			) ?? port;
	}

	// MuMuPlayer for macOS uses the normal adb port unless a custom one is set
	if (port === undefined && process.platform === "darwin") {
		log.warn("MuMuPlayer did not report an ADB port, using 5555.");
		port = 5555;
	}

	if (port === undefined) {
		throw new Error(
			"MuMuPlayer did not report an ADB port. Start the instance and enable ADB in MuMuPlayer settings.",
		);
	}

	return { host, port };
}

export async function setupMuMuAdb(): Promise<
	NbsAndroidDebugBridge | undefined
> {
	const located = await locateMuMuInteractive();
	if (located === undefined) return undefined;

	const { layout } = located;
	const spin = spinner();
	spin.start("Reading MuMuPlayer instances...");

	let instances: MuMuInstance[];
	try {
		instances = instancesFrom(await readInfo(layout));
	} catch (error) {
		spin.error("Failed to read MuMuPlayer instances");
		throw error;
	}

	if (instances.length === 0) {
		spin.error("No MuMuPlayer instances found");
		throw new Error(
			"MuMuPlayer has no Android instances. Create one in MuMuPlayer first.",
		);
	}

	spin.stop(`Found ${instances.length} MuMuPlayer instance(s)`);

	const selected = await select({
		message:
			"Select target instance to use. Note: that after selection, it will be launched once.",
		options: instances.map((instance) => {
			return {
				value: instance.index,
				label: instance.name,
				hint:
					instance.androidVersion === undefined
						? undefined
						: `Android ${instance.androidVersion}`,
			};
		}),
	});

	if (isCancel(selected)) return undefined;

	const index = String(selected);
	spin.start("Running instance, please wait...");

	try {
		await launchInstance(layout, index);

		const instance = await waitForBoot(layout, index, spin);

		spin.message("Getting adb host info...");
		const adb = await readAdb(layout, index, instance);
		spin.stop("Done");

		return {
			command: layout.command,
			args: layout.launchArgs(index),
			deviceAddress: adb.host,
			devicePort: adb.port,
			defaultDevice: `${adb.host}:${adb.port}`,
			waitForDevice: true,
		};
	} catch (error) {
		spin.error("Failed to start MuMuPlayer instance");
		throw error;
	}
}
