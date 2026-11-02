import { existsSync } from "node:fs";
import {
	type LilconfigResult,
	lilconfigSync,
	type OptionsSync,
} from "lilconfig";

export interface NbsAndroidDebugBridge {
	/**
	 * Command which will be executed each time when adb access required
	 * Mostly needed to run emulator
	 */
	command: string;

	/**
	 * Args which will passed along with command
	 */
	args: string;

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
	id: string;

	/** Process run config for watcher and deeplink's */
	process?: Partial<NbsProcessConfig>;
}

function initializeBaseConfig() {
	const searcher = lilconfigSync("nbs", {
		searchPlaces: ["package.json"],
	});

	const result = searcher.search();

	return result?.config ?? {};
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

export default config;
