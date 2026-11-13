import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { log } from "@clack/prompts";
import {
	parse as parseToml,
	patch as patchTomlText,
	TomlFormat,
} from "@decimalturn/toml-patch";
import type { Interfaces } from "@oclif/core";
import { type LilconfigResult, lilconfig, lilconfigSync } from "lilconfig";
import { parse } from "smol-toml";
import type { BaseCommand } from "./shared/command.js";
import type { BattleParameterValue } from "./shared/deeplink.js";
import {
	ensureWriteAccess,
	resolveScriptIdOrCreate as resolveScriptOrCreate,
} from "./shared/scripts.js";
import { isUuid } from "./shared/uuid.js";

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

	/**
	 * Name of device which will be picked first when searching for adb devices
	 */
	defaultDevice: string;

	/**
	 * If true, stars watching for any device connection, or defaultDevice if defined
	 * In other case throws device not found error
	 */
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
	 * Common values include 5555 and 16384.
	 * Leave unset if the device is already visible to the adb server.
	 */
	devicePort: number;
}

export interface NbsProcessConfig {
	adb: Partial<NbsAndroidDebugBridge>;
}

interface Config {
	/** Script UUID */
	id: string;

	/** Script name */
	name: string;

	/** Script description */
	description: string;

	/** Script filepath */
	path: string;

	/** Process run config for watcher and deeplink's */
	process: Partial<NbsProcessConfig>;

	/**
	 * An array of friendly battle room parameters
	 */
	parameters: BattleParameterValue[];
}

export type NbsConfig = Partial<Config>;

/** Flags shared by every command, including global config overrides */
export type BaseCommandFlags = Interfaces.InferredFlags<
	typeof BaseCommand.baseFlags
>;

export class NbsConfigLoader implements NbsConfig {
	private static readonly CONFIG_NAME = "nbs";

	/**
	 * Config file names. This is a convention only: `nbsproject` holds the core
	 * project properties and `.nbsrc` holds any user-local parameters (such as
	 * `process`). Both are loaded by separate searchers and merged into this
	 * single instance, no cross-validation is performed
	 */
	private static readonly NAMES = ["nbsproject", ".nbsrc"] as const;

	/** Directories searched for a config, relative to the project root */
	private static readonly FOLDERS = ["", ".config"] as const;

	/**
	 * Extensions tried for every location
	 * An empty extension means an extension-less toml file
	 */
	private static readonly EXTENSIONS = [
		"",
		".json",
		".toml",
		".js",
		".cjs",
		".mjs",
	] as const;

	/**
	 * lilconfig loaders
	 * toml is parsed by smol-toml and patched by @decimalturn/toml-patch
	 *
	 * lilconfig names the loader for extension-less files `noExt`, so both
	 * `.nbsrc` and `.nbsrc.toml` are parsed as toml
	 */
	private static readonly LOADERS = {
		".toml": NbsConfigLoader.loadToml,
		noExt: NbsConfigLoader.loadToml,
	};

	private static loadToml(_filepath: string, content: string): unknown {
		return parse(content.replace(/^\uFEFF/, ""));
	}

	public id!: string;
	public name!: string;
	public description?: string;
	public path!: string;
	public process?: NbsProcessConfig;
	public parameters?: BattleParameterValue[];

	/** Absolute path of the config file that was loaded, if any */
	public configFilepath?: string;

	/** Absolute path of the config file that defines `path` */
	private pathFilepath?: string;

	/** Absolute path of the config file that defines each loaded property */
	private readonly propertyFilepaths = new Map<keyof NbsConfig, string>();

	/** Loads an explicitly provided config file, regardless of its name */
	private readonly loader = lilconfig(NbsConfigLoader.CONFIG_NAME, {
		searchPlaces: NbsConfigLoader.searchPlaces(NbsConfigLoader.NAMES),
		loaders: NbsConfigLoader.LOADERS,
	});

	/** One searcher per config name, results are merged into this instance */
	private readonly searchers = NbsConfigLoader.NAMES.map((name) =>
		lilconfig(NbsConfigLoader.CONFIG_NAME, {
			searchPlaces: NbsConfigLoader.searchPlaces([name]),
			loaders: NbsConfigLoader.LOADERS,
		}),
	);

	/** Builds config candidates from names, folders and extensions */
	private static searchPlaces(names: readonly string[]): string[] {
		return names.flatMap((name) =>
			NbsConfigLoader.FOLDERS.flatMap((folder) =>
				NbsConfigLoader.EXTENSIONS.map((extension) =>
					join(folder, `${name}${extension}`),
				),
			),
		);
	}

	/**
	 * Loads config values into this instance
	 *
	 * @param flags parsed command flags, including global config overrides
	 * @param write require write access to the target script
	 */
	public async initialize(flags: Partial<BaseCommandFlags>): Promise<void> {
		this.apply(this.loadPackage());

		for (const searcher of this.searchers) {
			const result = await searcher.search();
			this.apply(result);
		}

		if (flags.project !== undefined && existsSync(flags.project)) {
			this.apply(await this.loader.load(flags.project));
		}

		// An explicit script path is relative to the working directory, not to
		// the config file that was loaded above
		if (flags.path !== undefined) {
			this.path = flags.path;
			this.pathFilepath = undefined;
		}

		if (flags.id !== undefined) {
			await this.applyId(flags.id);
		}

		this.resolvePath();
	}

	/**
	 * Verifies that the target script can be modified
	 * A foreign script is offered for forking into a new owned script,
	 * which also rewrites the script id in the config
	 */
	public async ensureWritable(): Promise<void> {
		this.resolvePath();
		this.validateScript();
		this.id = await ensureWriteAccess(this.id);
	}

	/**
	 * Verifies that current config has valid configuration
	 * to run device and run script on it
	 */
	public ensureDevice(): void {
		if (this.process?.adb === undefined) {
			throw new Error(
				"Device is not configured. Run `nbs init --device` to set up appropriate device.",
			);
		}

		this.validateProcess();
	}

	/**
	 * Applies the target script override
	 * A UUID is used as-is, while a name is resolved (or created) through the API
	 * Names are matched fuzzily, so they do not have to match the real script name exactly
	 */
	private async applyId(id: string): Promise<void> {
		if (isUuid(id)) {
			this.id = id;
			return;
		}

		const script = await resolveScriptOrCreate(id);
		this.name = script.name;
		this.id = script.script_id;
	}

	/**
	 * Resolves a relative script path against the config file that defined it
	 */
	private resolvePath(): void {
		if (this.path === undefined) return;

		const base =
			this.pathFilepath === undefined
				? process.cwd()
				: dirname(this.pathFilepath);

		this.path = resolve(base, this.path);
	}

	/**
	 * Validation of core script properties
	 */
	private validateScript(): void {
		const problems: string[] = [];

		if (this.id === undefined || !isUuid(this.id)) {
			problems.push(
				"`id` must be a valid uuid. Perhaps create a new one using `nbs init`?",
			);
		}

		if (this.name === undefined || this.name.length === 0) {
			problems.push("`name` must not be empty");
		}

		if (this.path !== undefined && !existsSync(this.path)) {
			problems.push(`script at path "${this.path}" doesn't exist`);
		}

		if (problems.length > 0) {
			throw new Error(`Invalid nbs config:\n- ${problems.join("\n- ")}`);
		}
	}

	/**
	 * Validation of device process properties
	 */
	private validateProcess(): void {
		const problems: string[] = [];

		if (this.process?.adb !== undefined) {
			const adb = this.process.adb;
			if (adb.command !== undefined && !existsSync(adb.command)) {
				problems.push(
					`command at path "${adb.command}" should be a valid executable, but it doesn't exist`,
				);
			}

			if (
				adb.devicePort !== undefined &&
				(!Number.isInteger(adb.devicePort) ||
					adb.devicePort <= 0 ||
					adb.devicePort > 65535)
			) {
				problems.push(`devicePort "${adb.devicePort}" must be 1-65535`);
			}
		}

		if (problems.length > 0) {
			throw new Error(
				`Invalid nbs process config:\n- ${problems.join("\n- ")}`,
			);
		}
	}

	/**
	 * Loads config from the nearest package.json
	 *
	 * package.json is only a config source when it has an `nbs` field. A script
	 * must always have an explicit id, so a package without `nbs` is ignored.
	 */
	private loadPackage(): LilconfigResult {
		const searcher = lilconfigSync(NbsConfigLoader.CONFIG_NAME, {
			searchPlaces: ["package.json"],
		});

		const result = searcher.search();
		if (result === null) return result;

		const config = (result.config ?? {}) as Partial<NbsConfig>;

		// Trying to pick up the script path from package.json
		if (config.path === undefined) {
			try {
				const parsed = JSON.parse(
					readFileSync(result.filepath, { encoding: "utf8" }),
				) as Record<string, unknown>;

				if (typeof parsed["main"] === "string") {
					config.path = parsed["main"];
				}
			} catch {
				// A malformed package.json is reported later by the project loader
			}
		}

		result.config = config;
		result.isEmpty = Object.keys(config).length === 0;

		return result;
	}

	/**
	 * Merges a searcher result into this instance
	 * Empty or missing results are ignored so later sources keep previously loaded values
	 */
	private apply(result: LilconfigResult): void {
		if (result === null || result.isEmpty || result.config === undefined) {
			return;
		}

		const source = result.config as Partial<NbsConfig>;

		// Only the file that defines the target script can be patched with a new id
		if (typeof source.id === "string") {
			this.configFilepath = result.filepath;
		}

		// Remember where `path` came from so it can be resolved relative to it
		if (typeof source.path === "string") {
			this.pathFilepath = result.filepath;
		}

		// Remember where every property came from so patches hit the right file
		for (const key of Object.keys(source) as (keyof NbsConfig)[]) {
			if (source[key] !== undefined) {
				this.propertyFilepaths.set(key, result.filepath);
			}
		}

		this.load(source);
	}

	/**
	 * Writes config properties into the file that defined them and updates this
	 * instance. Files that cannot be edited safely are reported to the user.
	 */
	public async patch(properties: Partial<NbsConfig>): Promise<void> {
		this.load(properties);

		// Group properties by the config file they came from
		const groups = new Map<string | undefined, NbsConfig>();

		type Entries = [keyof NbsConfig, unknown][];
		for (const [key, value] of Object.entries(properties) as Entries) {
			if (value === undefined) continue;

			const filepath = this.propertyFilepaths.get(key) ?? this.configFilepath;
			const group = groups.get(filepath) ?? {};

			(group as Record<string, unknown>)[key] = value;
			groups.set(filepath, group);
		}

		for (const [filepath, group] of groups) {
			if (filepath === undefined) {
				this.reportManual(group);
				continue;
			}

			this.patchFile(filepath, group);

			// New properties now belong to the file they were written into
			for (const key of Object.keys(group) as (keyof NbsConfig)[]) {
				this.propertyFilepaths.set(key, filepath);
				if (key === "path") this.pathFilepath = filepath;
			}
		}

		if (properties.path !== undefined) this.resolvePath();
	}

	/** Routes a patch to the writer matching the config file format */
	private patchFile(filepath: string, properties: NbsConfig): void {
		switch (extname(filepath).toLowerCase()) {
			case ".json":
				this.patchJson(filepath, properties);
				return;

			case ".js":
			case ".cjs":
			case ".mjs":
				// Executable configs are code: rewriting them would harm to it's logic
				this.reportManual(properties, filepath);
				return;

			case "":
			case ".toml":
				this.patchToml(filepath, properties);
				return;

			default:
				this.reportManual(properties, filepath);
		}
	}

	/** Merges properties into a JSON config, including the `nbs` field of package.json */
	private patchJson(filepath: string, properties: NbsConfig): void {
		const raw = readFileSync(filepath, { encoding: "utf8" });

		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			this.reportManual(properties, filepath);
			return;
		}

		const target =
			basename(filepath) === "package.json"
				? parsed[NbsConfigLoader.CONFIG_NAME]
				: parsed;

		if (target === null || typeof target !== "object") {
			this.reportManual(properties, filepath);
			return;
		}

		Object.assign(target as Record<string, unknown>, properties);

		writeFileSync(filepath, JSON.stringify(parsed, null, 2), {
			encoding: "utf8",
		});
	}

	/**
	 * Merges properties into a TOML config without touching comments or ordering
	 * The library keeps the existing document layout, so only patched values change
	 */
	private patchToml(filepath: string, properties: NbsConfig): void {
		const raw = readFileSync(filepath, { encoding: "utf8" });
		const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
		const text = bom === "" ? raw : raw.slice(1);

		try {
			const current = parseToml(text) as Record<string, unknown>;
			const updated = { ...current, ...properties };

			let patched: string;
			try {
				patched = patchTomlText(text, updated);
			} catch {
				// Adding a new array of tables is not supported by the default
				// layout, so fall back to inline tables to keep the document valid
				const format = TomlFormat.default();
				format.inlineTableStart = 0;
				patched = patchTomlText(text, updated, format);
			}

			writeFileSync(filepath, `${bom}${patched}`, { encoding: "utf8" });
		} catch {
			this.reportManual(properties, filepath);
		}
	}

	/** Tells the user which properties have to be written into the config manually */
	private reportManual(properties: NbsConfig, filepath?: string): void {
		const assignments = Object.entries(properties)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
			.join("\n");

		if (assignments === "") return;

		if (filepath === undefined) {
			log.warn(
				`No config file found. Set these values manually:\n${assignments}`,
			);
			return;
		}

		log.warn(`Update "${filepath}" manually:\n${assignments}`);
	}

	/**
	 * Assigns core properties from json data
	 */
	private load(source: any): void {
		if (typeof source.name === "string") this.name = source.name;
		if (typeof source.id === "string") this.id = source.id;
		if (typeof source.description === "string") {
			this.description = source.description;
		}
		if (typeof source.path === "string") this.path = source.path;
		if (source.process !== undefined) this.process = source.process;
		if (Array.isArray(source.parameters)) this.parameters = source.parameters;
	}
}

const config = new NbsConfigLoader();

export default config;
