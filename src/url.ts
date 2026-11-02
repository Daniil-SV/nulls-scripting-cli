export const SCRIPTING_URL =
	process.env["NULLS_SCRIPTING_URL"] ?? "https://scripting.nulls.gg";

export const SCRIPTING_API =
	process.env["NULLS_SCRIPTING_API"] ?? `${SCRIPTING_URL}/api`;

export const CONNECT_URL =
	process.env["NULLS_CONNECT_URL"] ?? "https://connect.nulls.gg";

export const CONNECT_API =
	process.env["NULLS_CONNECT_API"] ?? "https://connect.nulls.gg/api";

/** scripting.nulls.gg OAuth client id on Null's Connect */
export const SCRIPTING_CLIENT_ID =
	process.env["NULLS_CONNECT_CLIENT_ID"] ?? "9";

export const SCRIPTING_REDIRECT_URI =
	process.env["NULLS_CONNECT_REDIRECT_URI"] ??
	"https://scripting.nulls.gg/connect";

export const BATTLE_REALM = "experiment:scripts";
export const BATTLE_LINK_PREFIX = "nullsbrawl://createAndJoinRoom?roomname=";
export const PARAMS_PREFIX = "params:v2:";
