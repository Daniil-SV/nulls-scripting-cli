import base62 from "@sindresorhus/base62";
import {
	BATTLE_LINK_PREFIX,
	BATTLE_REALM,
	PARAMS_PREFIX,
	SCRIPTING_API,
} from "../url.js";

export class DeeplinkError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export interface BattleParameterBaseline {
	/** Global parameter uuid */
	id: string;

	/** Human-readable name as returned by `GET /scripts/{id}/parameters` */
	name: string;

	/** Hardcoded value subtracted from the UI value before encoding */
	baseline: number;
}

export const PARAM_BASELINES: readonly BattleParameterBaseline[] = [
	{
		id: "08d59fd7-b5ba-41c0-ac91-0ec36ad2fda7",
		name: "levelHitPoints",
		baseline: 11,
	},
	{
		id: "27debbd9-1800-453b-98cb-778faebf03ec",
		name: "levelSkillWeapon",
		baseline: 11,
	},
	{
		id: "850fa2e7-b6a8-4f65-a4d7-15e730772380",
		name: "levelSkillUlti",
		baseline: 11,
	},
	{
		id: "0118efa9-4916-4258-896d-08d8fa6cb447",
		name: "levelServer",
		baseline: 11,
	},
	{
		id: "67308acc-a26a-423d-9bd4-0a483aaddc16",
		name: "speedBuffPercent",
		baseline: 100,
	},
	{
		id: "ef7f2daf-ecb6-4b45-b54a-05be2abf3028",
		name: "reloadBuffPercent",
		baseline: 100,
	},
	{
		id: "27df50dd-9b42-480b-ba29-252cb5b7d390",
		name: "chargeUltiPercent",
		baseline: 0,
	},
	{
		id: "d406daa9-299a-4c1f-8e38-7c0b7447f0e3",
		name: "chargeUltiAutomatically",
		baseline: 0,
	},
	{
		id: "588e2a5d-b1da-4ab1-af06-90fbf82ad845",
		name: "chargeOverchargeAutomatically",
		baseline: 0,
	},
	{
		id: "06e2388f-caee-4434-a2b5-729b837d0c63",
		name: "accessoryCooldownSubtractPercent",
		baseline: 100,
	},
	{
		id: "4a66586c-2d0e-48b8-b7a8-82dbd31f60ba",
		name: "additionalPetsCount",
		baseline: 0,
	},
	{
		id: "9984be89-1a06-469a-b6e4-4fb9cf6fdcc6",
		name: "poisonDamagePercent",
		baseline: 20,
	},
	{
		id: "90c21bbe-dfd4-4bf0-b0a8-26f5a9c193e5",
		name: "regenerationHeroPercent",
		baseline: 0,
	},
	{
		id: "19c252fe-337b-4830-b42b-831ccb1fd019",
		name: "disablePoison",
		baseline: 0,
	},
	{
		id: "7425f7c2-3a70-4655-8a55-aa6e40b55cac",
		name: "botsDifficulty",
		baseline: 0,
	},
	{
		id: "a3526238-44ab-4465-b338-a26a0bac9009",
		name: "respawnShieldExpandSeconds",
		baseline: 3,
	},
	{
		id: "0f1e4985-d6f2-4acc-8629-bc052fae5df9",
		name: "hasGadgets",
		baseline: 0,
	},
	{
		id: "3b448328-99e4-4c63-ac08-1a6144299386",
		name: "hasStarPowers",
		baseline: 0,
	},
	{
		id: "2793b21b-a1b2-47e6-a777-7dde43388332",
		name: "hasOvercharges",
		baseline: 0,
	},
	{
		id: "6c60b2c1-90df-4ed6-9d65-f72cb3df959c",
		name: "gearsAmount",
		baseline: 0,
	},
	{
		id: "5e9dfbe2-dc36-4492-b2f7-163b2b61b507",
		name: "boxPowerPoints",
		baseline: 0,
	},
	{
		id: "3e4e283d-0950-4d29-9694-0b788c6f2151",
		name: "disablePoisonProgression",
		baseline: 0,
	},
	{
		id: "a709ece0-ff74-4271-acae-9fdb0b6edb86",
		name: "clientSpawnOffset",
		baseline: 0,
	},
	{
		id: "6dfa1632-da82-4c48-9028-83b11729396a",
		name: "restrictTeamJoin",
		baseline: 0,
	},
	{
		id: "afc1c68c-34f3-4808-ad44-4d0019fa2a7c",
		name: "characterPowerPointsRate",
		baseline: 0,
	},
	{
		id: "9f654a06-ff46-4150-8313-eb602e245103",
		name: "viewSelection",
		baseline: 0,
	},
	{
		id: "5ba9cf79-aa86-4979-9c60-c3fff5f5503f",
		name: "allowSelfKill",
		baseline: 0,
	},
	{
		id: "13d8a58d-aa94-483a-8423-20da88dac86a",
		name: "enableChat",
		baseline: 0,
	},
	{
		id: "b464565d-f0c7-4f0d-a178-3cfeaf0bb6dd",
		name: "hasBuddyGadgets",
		baseline: 0,
	},
	{
		id: "5a35d6df-3180-4ea0-bb9d-554eae8071cb",
		name: "hasBuddyStarPowers",
		baseline: 0,
	},
	{
		id: "e8798ee0-3ced-4863-ae18-9c64d49ea7d2",
		name: "hasBuddyOvercharges",
		baseline: 0,
	},
	{
		id: "e42bf28e-fb71-473e-a90c-e8181a1caf2c",
		name: "automaticTicks",
		baseline: 0,
	},
];

export interface BattleRoomCreateData {
	realm: typeof BATTLE_REALM;

	/** Signed content URL: `<api>/scripts/<id>/content?token=<token>` */
	script: string;

	/** 32 offsets (`uiValue - baseline`), in {@link PARAM_BASELINES} order */
	bp: number[];

	/** `user_map_internal_id` of the script's selected map, when set. */
	map?: string;
}

export interface BattleParameter {
	id: string;
	name: string;
	default_value: number;
	min_value?: number | null;
	max_value?: number | null;
	type?: "int" | "bool" | string;
}

export interface BuildBattleLinkOptions {
	scriptId: string;

	shareToken: string;

	/**
	 * Parameter definitions for the script (from `GET /scripts/{id}/parameters`).
	 * Used for defaults and range checks; omit to encode all-zero offsets
	 */
	parameters?: readonly BattleParameter[];

	/**
	 * Overrides keyed by parameter name or uuid. Unlisted parameters use their
	 * `default_value` (or the baseline when `parameters` is omitted)
	 */
	values?: Readonly<Record<string, number>>;

	mapCode?: string | null;

	/**
	 * API base used inside the signed `script` URL
	 */
	apiBase?: string;
}

export function encodePayload(payload: unknown): string {
	return base62.encodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodePayload<T = unknown>(payload: string): T {
	const bytes = base62.decodeBytes(payload);
	let json: string;
	try {
		json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new DeeplinkError("Payload is not valid UTF-8");
	}

	try {
		return JSON.parse(json) as T;
	} catch {
		throw new DeeplinkError("Payload is not valid JSON");
	}
}

/** Build the signed content URL embedded in the deep link */
export function buildShareUrl(
	scriptId: string,
	shareToken: string,
	apiBase: string = SCRIPTING_API,
): string {
	const base = apiBase.replace(/\/+$/, "");
	return `${base}/scripts/${scriptId}/content?token=${encodeURIComponent(shareToken)}`;
}

/** Throw when an override key is neither a known parameter name nor uuid */
export function validateParameterOverrides(
	values: Readonly<Record<string, number>> | undefined,
	parameters?: readonly BattleParameter[],
): void {
	if (!values) return;
	for (const key of Object.keys(values)) {
		const known =
			PARAM_BASELINES.some((entry) => entry.id === key || entry.name === key) ||
			parameters?.some((item) => item.id === key || item.name === key);

		if (!known) {
			throw new DeeplinkError(
				`Unknown parameter ${JSON.stringify(key)}. Known names: ${PARAM_BASELINES.map((entry) => entry.name).join(", ")}`,
			);
		}
	}
}

function resolveValue(
	entry: BattleParameterBaseline,
	parameters: readonly BattleParameter[] | undefined,
	values: Readonly<Record<string, number>> | undefined,
): number {
	const parameter = parameters?.find((item) => item.id === entry.id);
	const override = values?.[entry.id] ?? values?.[entry.name];
	const value = override ?? parameter?.default_value ?? entry.baseline;

	if (!Number.isInteger(value)) {
		throw new DeeplinkError(
			`Parameter ${entry.name} must be an integer (got ${value})`,
		);
	}
	if (parameter) {
		if (parameter.type === "bool" && value !== 0 && value !== 1) {
			throw new DeeplinkError(
				`Parameter ${entry.name} is a boolean and must be 0 or 1 (got ${value})`,
			);
		}
		if (parameter.min_value != null && value < parameter.min_value) {
			throw new DeeplinkError(
				`Parameter ${entry.name} must be >= ${parameter.min_value} (got ${value})`,
			);
		}
		if (parameter.max_value != null && value > parameter.max_value) {
			throw new DeeplinkError(
				`Parameter ${entry.name} must be <= ${parameter.max_value} (got ${value})`,
			);
		}
	}

	return value;
}

/** Build JSON into `roomname` */
export function buildBattlePayload(
	options: BuildBattleLinkOptions,
): BattleRoomCreateData {
	const {
		scriptId,
		shareToken,
		parameters,
		values,
		mapCode: mapInternalId,
		apiBase,
	} = options;

	if (!scriptId.trim()) throw new DeeplinkError("Missing script id");
	if (!shareToken.trim()) {
		throw new DeeplinkError(
			"Missing share token. The site always mints one with `POST /scripts/{id}/share` first",
		);
	}

	if (values) {
		validateParameterOverrides(values, parameters);
	}

	const payload: BattleRoomCreateData = {
		realm: BATTLE_REALM,
		script: buildShareUrl(scriptId, shareToken, apiBase),
		bp: PARAM_BASELINES.map(
			(entry) => resolveValue(entry, parameters, values) - entry.baseline,
		),
	};
	if (mapInternalId) payload.map = mapInternalId;

	return payload;
}

/** Build the full `nullsbrawl://createAndJoinRoom?...` URL */
export function buildBattleLink(options: BuildBattleLinkOptions): string {
	return `${BATTLE_LINK_PREFIX}${PARAMS_PREFIX}${encodePayload(
		buildBattlePayload(options),
	)}&friendly=1&side=0`;
}

/** Extract the `params:v2:` payload from a deep link */
export function extractRoomsParams(input: string): string {
	const trimmed = input.trim();
	if (!trimmed.toLowerCase().startsWith("nullsbrawl://")) {
		return trimmed.startsWith(PARAMS_PREFIX)
			? trimmed.slice(PARAMS_PREFIX.length)
			: trimmed;
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new DeeplinkError("Not a valid URL");
	}

	if (url.protocol.toLowerCase() !== "nullsbrawl:") {
		throw new DeeplinkError(
			`Expected a nullsbrawl:// link, got ${url.protocol}`,
		);
	}

	const room = url.searchParams.get("roomname");
	if (!room) {
		throw new DeeplinkError("Deep link has no `roomname` query parameter");
	}

	if (!room.startsWith(PARAMS_PREFIX)) {
		throw new DeeplinkError(
			`Unsupported roomname ${JSON.stringify(room)} — expected ${PARAMS_PREFIX}<base62>`,
		);
	}

	return room.slice(PARAMS_PREFIX.length);
}

/** Decode a battle deep link (or bare base62 payload) into json */
export function parseBattleLink(input: string): BattleRoomCreateData {
	const payload = decodePayload<BattleRoomCreateData>(
		extractRoomsParams(input),
	);
	if (!payload || typeof payload !== "object") {
		throw new DeeplinkError("Payload is not an object.");
	}
	if (payload.realm !== BATTLE_REALM) {
		throw new DeeplinkError(
			`Unexpected realm ${JSON.stringify(payload.realm)} — expected ${JSON.stringify(BATTLE_REALM)}.`,
		);
	}
	if (typeof payload.script !== "string") {
		throw new DeeplinkError("Payload has no `script` URL.");
	}
	if (
		!Array.isArray(payload.bp) ||
		payload.bp.some((value) => !Number.isInteger(value))
	) {
		throw new DeeplinkError("Payload `bp` must be an array of integers.");
	}
	if (payload.map !== undefined && typeof payload.map !== "string") {
		throw new DeeplinkError("Payload `map` must be a string when present.");
	}
	return payload;
}

/** Pull the script id and share token back out of a decoded payload */
export function parseShareUrl(
	shareUrl: string,
): { scriptId: string; token: string } | null {
	let url: URL;
	try {
		url = new URL(shareUrl);
	} catch {
		return null;
	}

	const match = /\/scripts\/([^/]+)\/content\/?$/.exec(url.pathname);
	if (!match) return null;

	const token = url.searchParams.get("token");
	if (!token) return null;

	return { scriptId: decodeURIComponent(match[1] as string), token };
}

/** Parse a map reference into the internal id stored in the deep link */
export function parseMapLink(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) throw new DeeplinkError("Missing map id.");

	const withoutPrefix = trimmed.startsWith("map:") ? trimmed.slice(4) : trimmed;
	if (!withoutPrefix.includes("://")) return withoutPrefix;

	let url: URL;
	try {
		url = new URL(withoutPrefix);
	} catch {
		throw new DeeplinkError("Not a valid map link.");
	}

	const roomname = url.searchParams.get("roomname");
	if (!roomname) {
		throw new DeeplinkError(
			"Map link has no `roomname` — expected https://link.nulls.gg/nulls-brawl/createAndJoinRoom?roomname=<id>.",
		);
	}

	return roomname.startsWith("map:") ? roomname.slice(4) : roomname;
}

/**
 * Decode a script-page preset link (`?params=<base62>`), which is a json object
 * keyed by parameter uuid. Accepts a full URL, `params=<payload>`
 */
export function parseParamsPreset(input: string): Record<string, number> {
	const trimmed = input.trim();
	let payload = trimmed;

	if (trimmed.startsWith("params=")) {
		payload = trimmed.slice("params=".length);
	} else if (trimmed.includes("://") || trimmed.includes("?")) {
		let url: URL;
		try {
			url = new URL(trimmed, "https://scripting.nulls.gg/");
		} catch {
			throw new DeeplinkError("Not a valid URL.");
		}
		const value = url.searchParams.get("params");
		if (!value) {
			throw new DeeplinkError("URL has no `params` query parameter.");
		}
		payload = value;
	}

	const values = decodePayload<unknown>(payload);
	if (!values || typeof values !== "object" || Array.isArray(values)) {
		throw new DeeplinkError("Preset payload is not a JSON object.");
	}
	const result: Record<string, number> = {};
	for (const [key, value] of Object.entries(
		values as Record<string, unknown>,
	)) {
		if (typeof value !== "number" || !Number.isInteger(value)) {
			throw new DeeplinkError(
				`Preset value for ${JSON.stringify(key)} is not an integer.`,
			);
		}
		result[key] = value;
	}
	return result;
}

export type DecodedLink =
	| {
			kind: "battle";
			payload: BattleRoomCreateData;
			share: ReturnType<typeof parseShareUrl>;
	  }
	| { kind: "params"; values: Record<string, number> };

/**
 * Decode either a battle deep link or a `?params=` preset link
 */
export function decodeLink(input: string): DecodedLink {
	const trimmed = input.trim();
	const looksLikePreset =
		!trimmed.toLowerCase().startsWith("nullsbrawl://") &&
		!trimmed.startsWith(PARAMS_PREFIX) &&
		(trimmed.includes("?") || trimmed.includes("params="));

	if (looksLikePreset) {
		return { kind: "params", values: parseParamsPreset(trimmed) };
	}

	try {
		const payload = parseBattleLink(trimmed);
		return { kind: "battle", payload, share: parseShareUrl(payload.script) };
	} catch (error) {
		if (!trimmed.includes("?") && !trimmed.includes("params=")) {
			return { kind: "params", values: parseParamsPreset(trimmed) };
		}
		throw error;
	}
}
