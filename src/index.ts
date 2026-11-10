export { run } from "@oclif/core";

export type {
	NbsAndroidDebugBridge,
	NbsConfig,
	NbsProcessConfig,
} from "./config.js";
export { default as config, initializeConfig, resolvePath } from "./config.js";

export {
	BATTLE_LINK_PREFIX,
	BATTLE_REALM,
	CONNECT_API,
	CONNECT_URL,
	PARAMS_PREFIX,
	SCRIPTING_API,
	SCRIPTING_CLIENT_ID,
	SCRIPTING_REDIRECT_URI,
	SCRIPTING_URL,
} from "./url.js";

export { SafeClient } from "./api/client.js";
export { ConnectError, NullsConnectAPI } from "./api/connect/index.js";
export type { LinkedAccount } from "./api/connect/index.js";
export { default as Api, ScriptingAPIError } from "./api/scripting/index.js";
export type { ScriptSummary } from "./api/scripting/index.js";

export * from "./shared/auth.js";
export * from "./shared/deeplink.js";
export * from "./shared/scripts.js";
