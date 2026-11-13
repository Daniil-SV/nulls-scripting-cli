import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	confirm,
	intro,
	isCancel,
	log,
	outro,
	select,
	text,
} from "@clack/prompts";
import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import which from "which";
import config, { type NbsAndroidDebugBridge } from "@/config.js";
import { setupMuMuAdb } from "./mumu.js";

async function setupAdbManual(): Promise<
	Partial<NbsAndroidDebugBridge> | undefined
> {
	const config: Partial<NbsAndroidDebugBridge> = {};
	const command = await text({
		message: "Command to run adb with (Emulator path, script, etc.)",
		validate: (value) => {
			const input = (value ?? "").trim();
			if (input === "") return undefined;

			// Allow commands from PATH, but verify explicit file paths
			if ((input.includes("/") || input.includes("\\")) && !existsSync(input)) {
				return `File "${input}" does not exist`;
			}

			return undefined;
		},
	});

	if (!isCancel(command) && command.trim().length !== 0) {
		config.command = command.trim();
	}

	if (config.command !== undefined) {
		const args = await text({
			message: "Args to run command with (comma-separated: arg1,arg2...)",
		});

		if (!isCancel(args) && args.trim().length !== 0) {
			config.args = args
				.split(",")
				.map((argument) => argument.trim())
				.filter((argument) => argument !== "");
		}
	}

	const address = await text({
		message: "Address of device to listen from",
		placeholder: "127.0.0.1",
	});

	if (!isCancel(address) && address.trim().length !== 0) {
		config.deviceAddress = address.trim();
	}

	const port = await text({
		message: "Port of device to listen from",
		placeholder: "5555",
		validate: (value) => {
			const input = (value ?? "").trim();
			if (input === "") return undefined;

			const number = Number(input);
			if (!Number.isInteger(number) || number <= 0 || number > 65535) {
				return "Invalid port number";
			}

			return undefined;
		},
	});

	if (!isCancel(port) && port.trim().length !== 0) {
		config.devicePort = Number(port);
	}

	const name = await text({
		message: "Name of target device (leave empty to connect to any available)",
	});

	if (!isCancel(name) && name.trim().length !== 0) {
		config.defaultDevice = name.trim();
	}

	const wait = await confirm({
		message:
			"Do you want to wait until device is found? Useful when your script or emulator needs some time to prepare",
	});

	if (!isCancel(wait)) {
		config.waitForDevice = wait;
	}

	return Object.keys(config).length === 0 ? undefined : config;
}

export async function createAdbConfig(): Promise<
	Partial<NbsAndroidDebugBridge> | undefined
> {
	const method = await select({
		message: "Select setup preset",
		options: [
			{
				value: "manual",
				label: "Manual",
				hint: "Manually setting up adb host ip, ports, etc.",
			},
			{
				value: "mumu",
				label: "MuMuPlayer",
				hint: "Use MuMuPlayer emulator as a device",
			},
		],
	});

	if (isCancel(method)) return undefined;

	switch (method) {
		case "manual":
			return setupAdbManual();

		case "mumu":
			return setupMuMuAdb();
	}
}

export class AdbError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export class AdbServer {
	private connector = new AdbServerNodeTcpConnector({
		host: "127.0.0.1",
		port: 5037,
	});

	private client = new AdbServerClient(this.connector);

	private cachedTransport?: Adb;

	private adbPath?: string;

	private adbServer?: Promise<void>;

	private get config() {
		return config.process?.adb ?? {};
	}

	private get deviceAddress() {
		return this.config.deviceAddress ?? "127.0.0.1";
	}

	/** `address:port` of the emulator adb daemon, if configured */
	private get deviceSerial() {
		const port = this.config.devicePort;
		if (port === undefined) return undefined;
		return `${this.deviceAddress}:${port}`;
	}

	/** Prefer adb from PATH, then the emulator directory */
	private async findAdb(): Promise<string | undefined> {
		if (this.adbPath !== undefined) return this.adbPath;

		const global = await which("adb", { nothrow: true });
		if (global !== null) {
			this.adbPath = global;
			return global;
		}

		const command = this.config.command;
		if (command === undefined) return undefined;

		const directory = dirname(command);
		const local = await which("adb", {
			path: directory,
			nothrow: true,
		});

		if (local !== null) {
			this.adbPath = local;
			return local;
		}

		// MuMuPlayer for macOS keeps adb inside its nested emulator bundle
		const bundled = [
			join(directory, "adb"),
			join(directory, "tools", "adb"),
			join(directory, "..", "Resources", "adb"),
			join(directory, "..", "Resources", "tools", "adb"),
			join(directory, "MuMuEmulator.app", "Contents", "MacOS", "adb"),
			join(directory, "MuMuEmulator.app", "Contents", "MacOS", "tools", "adb"),
			join(directory, "..", "MuMuEmulator.app", "Contents", "MacOS", "adb"),
			join(
				directory,
				"..",
				"MuMuEmulator.app",
				"Contents",
				"MacOS",
				"tools",
				"adb",
			),
		].find(existsSync);

		if (bundled !== undefined) {
			this.adbPath = bundled;
			return bundled;
		}

		return undefined;
	}

	private async startAdbServer(): Promise<void> {
		const adb = await this.findAdb();
		if (adb === undefined) {
			throw new AdbError(
				"adb executable not found. Install Android Platform Tools, add adb to PATH, " +
					"or set process.adb.command to an emulator executable whose folder contains adb.",
			);
		}

		await new Promise<void>((resolve, reject) => {
			const child = spawn(adb, ["start-server"], {
				stdio: "ignore",
				windowsHide: true,
			});

			child.once("error", (error) => {
				reject(
					new AdbError(`Failed to run "${adb} start-server": ${error.message}`),
				);
			});

			child.once("close", (code) => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(
					new AdbError(
						`"${adb} start-server" exited with code ${code ?? "unknown"}`,
					),
				);
			});
		});
	}

	private ensureAdbServer(): Promise<void> {
		this.adbServer ??= this.startAdbServer().catch((error) => {
			this.adbServer = undefined;
			throw error;
		});

		return this.adbServer;
	}

	/**
	 * Ask the adb server to connect to the emulator's/platform-tools adb daemon
	 * Without this, TCP-only emulators never show up in
	 * `host:devices-l` because nothing dials their port
	 */
	private async connectDevice() {
		const serial = this.deviceSerial;
		if (serial === undefined) return;

		try {
			await this.client.wireless.connect(serial);
		} catch (error) {
			if (error instanceof AdbServerClient.AlreadyConnectedError) return;

			// The emulator may still be booting. `waitForDevice` retries
		}
	}

	ensureRunning(silent: boolean = false) {
		const command = this.config.command;
		if (command === undefined) return;

		if (!silent) log.step(`Running ${command}`);
		const child = spawn(command, (this.config.args ?? []) as string[], {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		});

		child.unref();
	}

	private async chooseDevice(
		devices: AdbServerClient.Device[],
	): Promise<AdbServerClient.Device | undefined> {
		const selected = await select({
			message: "Select target device",
			options: devices.map((device) => {
				return {
					value: device.serial,
					label: device.serial,
					hint: [device.product, device.model, device.device]
						.filter((value) => value !== undefined)
						.join(" "),
				};
			}),
		});

		if (isCancel(selected)) return undefined;

		return devices.find((device) => device.serial === selected);
	}

	private async waitForDevice(silent: boolean) {
		// When a device port is configured, the emulator will register as
		// `<deviceAddress>:<devicePort>`, so use that as the default target
		const name = this.config.defaultDevice ?? this.deviceSerial;

		if (!silent) {
			if (name !== undefined) {
				log.step(`Waiting for device ${name}...`);
			} else {
				log.step(`Waiting for any device...`);
			}
		}

		while (true) {
			// Refresh every iteration: the emulator may be starting up
			await this.connectDevice();
			const devices = await this.client.getDevices();
			const filtered = devices.filter((device) => device.state === "device");

			if (name !== undefined) {
				const target = filtered.find((device) =>
					[
						device.serial === name,
						device.model === name,
						device.device === name,
					].includes(true),
				);

				if (target !== undefined) return target;
			}

			if (filtered.length >= 1) {
				if (silent) return undefined;

				const target = await this.chooseDevice(filtered);
				if (target !== undefined) return target;
			}

			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	private async execute(args: string[]): Promise<string> {
		const transport = await this.getTransport();
		return await transport.subprocess.noneProtocol.spawnWaitText(args);
	}

	async isAppRunning(name: string) {
		const pid = await this.execute(["pidof", name]);
		if (pid.length === 0) {
			return false;
		}

		const dump = await this.execute(["dumpsys", "activity", "activities"]);
		const match = dump.match(
			/(?:topResumedActivity|mResumedActivity)=ActivityRecord\{[^}]*?\bu\d+\s+([^/\s]+)\//,
		);

		return match?.[1] === name;
	}

	async getDevice(silent: boolean = false) {
		await this.ensureAdbServer();
		await this.connectDevice();
		const devices = await this.client.getDevices();
		let target: AdbServerClient.Device | undefined;

		if (this.config.waitForDevice) {
			return await this.waitForDevice(silent);
		}

		if (devices.length > 0 && !silent) {
			target = await this.chooseDevice(devices);
		}

		return target;
	}

	async getTransport() {
		await this.ensureAdbServer();
		if (this.cachedTransport !== undefined) return this.cachedTransport;
		const device = await this.getDevice(true);
		if (device === undefined) {
			throw new AdbError("Target device not found");
		}

		const transport = await this.client.createTransport(device);
		this.cachedTransport = new Adb(transport);
		return this.cachedTransport;
	}

	async openUrl(url: string, silent: boolean = false) {
		if (!silent) intro("adb");

		// The adb subprocess transport joins arguments and runs them through a
		// shell, so the URL must be quoted. Otherwise `&` in deeplinks splits
		// the command and the intent is launched with a truncated URL.
		const quotedUrl = `'${url.replace(/'/g, `'\\''`)}'`;

		await this.execute([
			"am",
			"start",
			"-W",
			"-a",
			"android.intent.action.VIEW",
			"-d",
			quotedUrl,
		]);

		if (!silent) outro("intent started");
	}
}
