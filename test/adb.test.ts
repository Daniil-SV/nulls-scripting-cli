import { describe, expect, it, vi } from "vitest";
import { AdbServer } from "@/device/adb.js";

vi.mock("@clack/prompts", () => ({
	confirm: vi.fn(),
	intro: vi.fn(),
	isCancel: vi.fn(() => false),
	log: { step: vi.fn(), warn: vi.fn() },
	outro: vi.fn(),
	select: vi.fn(),
	text: vi.fn(),
}));

describe("AdbServer.openUrl", () => {
	it("quotes deeplink urls so shell metacharacters survive", async () => {
		const server = new AdbServer();
		const calls: string[][] = [];

		(
			server as unknown as { execute(args: string[]): Promise<string> }
		).execute = async (args) => {
			calls.push(args);
			return "";
		};

		await server.openUrl(
			"nullsbrawl://createAndJoinRoom?roomname=test&friendly=1&side=0",
		);

		expect(calls).toEqual([
			[
				"am",
				"start",
				"-W",
				"-a",
				"android.intent.action.VIEW",
				"-d",
				"'nullsbrawl://createAndJoinRoom?roomname=test&friendly=1&side=0'",
			],
		]);
	});
});
