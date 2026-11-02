import { spawn } from "node:child_process";
import { intro, isCancel, log, outro, select } from "@clack/prompts";
import { Adb, AdbServerClient } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import config from "@/config.js";

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

	/**
	 * Ask the adb server to connect to the emulator's/platform-tools adb daemon
	 * Without this, TCP-only emulators (e.g. MuMu) never show up in
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

	private ensureRunning() {
		const command = this.config.command;
		if (command === undefined) return;

		log.step(`Running ${command}`);
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

		if (name !== undefined) {
			log.step(`Waiting for device ${name}...`);
		} else {
			log.step(`Waiting for any device...`);
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

	async getDevice(silent: boolean = false) {
		this.ensureRunning();
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
		const device = await this.getDevice();
		if (device === undefined) {
			throw new AdbError("Target device not found");
		}

		const transport = await this.client.createTransport(device);
		const adb = new Adb(transport);
		return adb;
	}

	async openUrl(url: string) {
		intro("adb");

		const transport = await this.getTransport();
		await transport.subprocess.noneProtocol.spawnWaitText([
			`am start -W -a android.intent.action.VIEW -d '${url.replace("'", "'\\''")}'`,
		]);

		outro("intent started");
	}
}
