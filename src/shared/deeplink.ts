import Api from "@/api/scripting/index.js";
import base62 from "@/shared/base62.js";
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

export type BattleParameterValue =
	| {
			name: "levelHitPoints";
			value: number;
	  }
	| {
			name: "levelSkillWeapon";
			value: number;
	  }
	| {
			name: "levelSkillUlti";
			value: number;
	  }
	| {
			name: "levelServer";
			value: number;
	  }
	| {
			name: "speedBuffPercent";
			value: number;
	  }
	| {
			name: "reloadBuffPercent";
			value: number;
	  }
	| {
			name: "chargeUltiPercent";
			value: number;
	  }
	| {
			name: "chargeUltiAutomatically";
			value: number;
	  }
	| {
			name: "chargeOverchargeAutomatically";
			value: number;
	  }
	| {
			name: "accessoryCooldownSubtractPercent";
			value: number;
	  }
	| {
			name: "additionalPetsCount";
			value: number;
	  }
	| {
			name: "poisonDamagePercent";
			value: number;
	  }
	| {
			name: "regenerationHeroPercent";
			value: number;
	  }
	| {
			name: "disablePoison";
			value: boolean;
	  }
	| {
			name: "botsDifficulty";
			value: number;
	  }
	| {
			name: "respawnShieldExpandSeconds";
			value: number;
	  }
	| {
			name: "hasGadgets";
			value: boolean;
	  }
	| {
			name: "hasStarPowers";
			value: boolean;
	  }
	| {
			name: "hasOvercharges";
			value: boolean;
	  }
	| {
			name: "gearsAmount";
			value: number;
	  }
	| {
			name: "boxPowerPoints";
			value: number;
	  }
	| {
			name: "disablePoisonProgression";
			value: boolean;
	  }
	| {
			name: "clientSpawnOffset";
			value: number;
	  }
	| {
			name: "restrictTeamJoin";
			value: number;
	  }
	| {
			name: "characterPowerPointsRate";
			value: number;
	  }
	| {
			name: "viewSelection";
			value: boolean;
	  }
	| {
			name: "allowSelfKill";
			value: boolean;
	  }
	| {
			name: "enableChat";
			value: boolean;
	  }
	| {
			name: "hasBuddyGadgets";
			value: boolean;
	  }
	| {
			name: "hasBuddyStarPowers";
			value: boolean;
	  }
	| {
			name: "hasBuddyOvercharges";
			value: boolean;
	  }
	| {
			name: "automaticTicks";
			value: boolean;
	  }
	| {
			name: string;
			value: number | boolean;
	  };

export interface BattleRoomCreateData {
	realm: typeof BATTLE_REALM;

	/** Signed content URL: `<api>/scripts/<id>/content?token=<token>` */
	script: string;

	/** 32 offsets (`uiValue - baseline`), in order of script parameters from API */
	bp: number[];

	/** `user_map_internal_id` of the script's selected map, when set */
	map?: string;
}

export interface BattleParameter {
	id: string;
	name: string;
	default_value: number | boolean;
	min_value?: number | null;
	max_value?: number | null;
	type?: "int" | "bool";
}

export interface BuildBattleLinkOptions {
	/**
	 * Target script id
	 */
	scriptId: string;

	/**
	 * Script share token
	 */
	shareToken: string;

	/**
	 * Overrides battle parameter value by parameter name or uuid
	 */
	parameters?: BattleParameterValue[];

	/**
	 * Optional map to create friendly room with
	 */
	mapCode?: string;
}

export function decodeOptions(payload: string) {
	const bytes = base62.decodeBytes(payload);
	let json: string;
	try {
		json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new DeeplinkError("Payload is not valid UTF-8");
	}

	try {
		return JSON.parse(json);
	} catch {
		throw new DeeplinkError("Payload is not valid JSON");
	}
}

/** Build the signed content URL embedded in the deep link */
export function buildShareUrl(scriptId: string, shareToken: string): string {
	return `${SCRIPTING_API}/scripts/${scriptId}/content?token=${encodeURIComponent(shareToken)}`;
}

/** Throw when an override key is neither a known parameter name nor uuid */
export function validateParameterOverrides(
	values: BattleParameterValue[],
	parameters: BattleParameter[],
): void {
	if (!values) return;
	for (const key of values) {
		const known = parameters?.some(
			(item) => item.id === key.name || item.name === key.name,
		);

		if (!known) {
			const names = parameters.map((entry) => entry.name);
			throw new DeeplinkError(
				`Unknown parameter ${JSON.stringify(key)}. Known names: ${names.join(", ")}`,
			);
		}
	}
}

function resolveValue(
	parameter: BattleParameter,
	overrides: BattleParameterValue[],
) {
	const override = overrides.find(
		(item) => item.name === parameter.id || item.name === parameter.name,
	);
	const value = override?.value ?? parameter.default_value;

	if (parameter.type === "int" && !Number.isInteger(value)) {
		throw new DeeplinkError(
			`Parameter ${parameter.name} must be an integer (got ${value})`,
		);
	}

	if (parameter.type === "bool" && typeof value !== "boolean") {
		throw new DeeplinkError(
			`Parameter ${parameter.name} must be an boolean (got ${value})`,
		);
	}

	if (typeof value === "number") {
		if (parameter.min_value != null && value < parameter.min_value) {
			throw new DeeplinkError(
				`Parameter ${parameter.name} must be >= ${parameter.min_value} (got ${value})`,
			);
		}

		if (parameter.max_value != null && value > parameter.max_value) {
			throw new DeeplinkError(
				`Parameter ${parameter.name} must be <= ${parameter.max_value} (got ${value})`,
			);
		}
	}

	if (typeof value === "boolean") {
		return Number(value);
	}

	return value - Number(parameter.default_value);
}

/** Build JSON into `roomname` */
export async function buildBattleOptions(
	options: BuildBattleLinkOptions,
): Promise<BattleRoomCreateData> {
	const { scriptId, shareToken, parameters, mapCode: mapInternalId } = options;

	if (!scriptId.trim()) throw new DeeplinkError("Missing script id");
	if (!shareToken.trim()) {
		throw new DeeplinkError(
			"Missing share token. The site always mints one with `POST /scripts/{id}/share` first",
		);
	}

	const base = await loadBattleParameters(scriptId);
	validateParameterOverrides(parameters ?? [], base);

	const data: BattleRoomCreateData = {
		realm: BATTLE_REALM,
		script: buildShareUrl(scriptId, shareToken),
		bp: base.map((parameter) => resolveValue(parameter, parameters ?? [])),
	};
	if (mapInternalId) data.map = mapInternalId;

	return data;
}

const cachedParameters: Map<string, BattleParameter[]> = new Map();
export async function loadBattleParameters(
	scriptId: string,
): Promise<BattleParameter[]> {
	const params = cachedParameters.get(scriptId);
	if (params !== undefined) return params;

	const { parameters } = await Api.get("/scripts/{scriptId}/parameters", {
		params: { path: { scriptId } },
	});

	const result = parameters.map((param) => {
		let value: number | boolean = param.default_value;
		if (param.type === "bool") value = Boolean(value);

		return {
			id: param.id,
			name: param.name,
			default_value: value,
			min_value: param.min_value,
			max_value: param.max_value,
			type: param.type,
		};
	});

	return result;
}

/** Build the full `nullsbrawl://createAndJoinRoom?...` URL */
export async function buildBattleLink(
	options: BuildBattleLinkOptions,
): Promise<string> {
	const data = await buildBattleOptions(options);
	const encoded = base62.encodeBytes(
		new TextEncoder().encode(JSON.stringify(data)),
	);

	return `${BATTLE_LINK_PREFIX}${PARAMS_PREFIX}${encoded}&friendly=1&side=0`;
}
