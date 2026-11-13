import config from "@/config.js";
import { AdbServer } from "./adb.js";

const NULLS_PACKAGE = "daniillnull.nulls.brawlstars";

class UserDevice {
	// TODO: other platforms?
	private _device: AdbServer | undefined;

	get device(): AdbServer {
		if (this._device === undefined) {
			if (config.process?.adb !== undefined) {
				this._device = new AdbServer();
			} else {
				throw new Error("Proper device configuration not found!");
			}
		}

		return this._device;
	}

	async ensureDevice(silent: boolean = false) {
		config.ensureDevice();
		this.device.ensureRunning(silent);
		await this.device.getDevice(silent);
	}

	async ensureNullsRunning() {
		return await this.device.isAppRunning(NULLS_PACKAGE);
	}

	async openUrl(url: string, silent: boolean = false) {
		await this.device.openUrl(url, silent);
	}
}

const device = new UserDevice();
export default device;
