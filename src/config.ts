import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type LilconfigResult,
	lilconfigSync,
	type OptionsSync,
} from "lilconfig";
import type { BattleParameterValue } from "./shared/deeplink.js";

export interface NbsAndroidDebugBridge {
	/**
	 * Command which will be executed each time when adb access required
	 * Mostly needed to run emulator
	 */
	command: string;

	/**
	 * Args which will passed along with command
	 */
	args: string[];

	defaultDevice: string;
	waitForDevice: boolean;

	/**
	 * Host where the emulator's adb daemon listens
	 * @default "127.0.0.1"
	 */
	deviceAddress: string;

	/**
	 * Port of the emulator's adb daemon. When set, nbs connects to
	 * `deviceAddress:devicePort` before looking for devices.
	 *
	 * Emulator specific: MuMu uses 16384, others often use 5555.
	 * Leave unset if the device is already visible to the adb server.
	 */
	devicePort: number;
}

export interface NbsProcessConfig {
	adb: Partial<NbsAndroidDebugBridge>;
}

export interface NbsConfig {
	/** Script name or UUID */
	name: string;

	/** Script filepath */
	path: string;

	/** Process run config for watcher and deeplink's */
	process?: Partial<NbsProcessConfig>;

	/**
	 * An array of friendly battle room parameters
	 */
	parameters: BattleParameterValue[];
}

function initializeBaseConfig() {
	const searcher = lilconfigSync("nbs", {
		searchPlaces: ["package.json"],
	});

	const result = searcher.search();
	if (result === null) return {};

	const config = (result?.config ?? {}) as Partial<NbsConfig>;

	// Trying to get path from package.json
	if (config.path === undefined) {
		const parsed = JSON.parse(
			readFileSync(result.filepath, { encoding: "utf8" }),
		);
		config.path = parsed["main"];
	}

	return config;
}

const config: Partial<NbsConfig> = {};
export function initializeConfig(path?: string) {
	const options: OptionsSync = {};
	const searcher = lilconfigSync("nbs", options);

	let result: LilconfigResult;
	if (path !== undefined && existsSync(path)) {
		result = searcher.load(path);
	} else {
		result = searcher.search();
	}

	const base = initializeBaseConfig();
	if (result?.isEmpty || result?.config === undefined) {
		Object.assign(config, base);
		return;
	}

	Object.assign(config, {
		...base,
		...result.config,
	});
}

export function resolvePath(override?: string): string {
	let path: string | undefined;
	if (override !== undefined) {
		path = resolve(override);
	}

	if (config.path !== undefined) {
		path = resolve(config.path);
	}

	if (path !== undefined) {
		if (!existsSync(path)) {
			throw new Error(`Script at path ${path} doesn't exist`);
		}

		return path;
	}

	throw new Error(
		"Failed to resolve script path! Make sure to create proper nbs config or provide filepath as argument",
	);
}

export default config;
