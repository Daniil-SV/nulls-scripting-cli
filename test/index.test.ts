import { describe, expect, it } from "vitest";
import * as api from "@/index.js";

describe("public API", () => {
	it("exposes the documented entry points", () => {
		for (const name of [
			"Api",
			"ConnectError",
			"NullsConnectAPI",
			"SafeClient",
			"ScriptingAPIError",
			"buildBattleLink",
			"buildBattleOptions",
			"buildShareUrl",
			"config",
			"decodeOptions",
			"initializeConfig",
			"resolvePath",
			"run",
			"validateParameterOverrides",
			"BATTLE_LINK_PREFIX",
			"BATTLE_REALM",
			"CONNECT_API",
			"CONNECT_URL",
			"PARAMS_PREFIX",
			"SCRIPTING_API",
			"SCRIPTING_CLIENT_ID",
			"SCRIPTING_REDIRECT_URI",
			"SCRIPTING_URL",
		]) {
			expect(api, name).toHaveProperty(name);
		}
	});
});
