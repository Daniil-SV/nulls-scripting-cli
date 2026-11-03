import { AdbServer } from "./adb.js";

const NULLS_PACKAGE = "daniillnull.nulls.brawlstars";

class UserDevice {
	private device: AdbServer;

	constructor() {
		// TODO: other platforms?
		this.device = new AdbServer();
	}

	async ensureDevice(silent: boolean = false) {
		this.device.ensureRunning();
		await this.device.getDevice(silent);
	}

	async ensureNullsRunning() {
		return await this.device.isAppRunning(NULLS_PACKAGE);
	}

	async openUrl(url: string) {
		await this.device.openUrl(url);
	}
}

const device = new UserDevice();
export default device;
