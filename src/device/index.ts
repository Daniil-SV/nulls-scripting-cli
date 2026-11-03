import { AdbServer } from "./adb.js";

class UserDevice {
	private device: AdbServer;

	constructor() {
		// TODO: other platforms?
		this.device = new AdbServer();
	}

	async ensureDevice() {
		this.device.ensureRunning();
	}

	async openUrl(url: string) {
		await this.device.openUrl(url);
	}
}


const device = new UserDevice();
export default device;