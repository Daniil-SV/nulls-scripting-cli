import { describe, expect, it } from "vitest";
import base62 from "@/shared/base62.js";
import {
	buildShareUrl,
	DeeplinkError,
	decodeOptions,
	validateParameterOverrides,
} from "@/shared/deeplink.js";
import { SCRIPTING_API } from "@/url.js";

function payload(value: string) {
	return base62.encodeBytes(new TextEncoder().encode(value));
}

describe("decodeOptions", () => {
	it("decodes base62 JSON payloads", () => {
		expect(
			decodeOptions(payload(JSON.stringify({ script: "x", bp: [1] }))),
		).toEqual({
			script: "x",
			bp: [1],
		});
	});

	it("rejects invalid JSON", () => {
		expect(() => decodeOptions(payload("not json"))).toThrow(DeeplinkError);
	});

	it("rejects invalid UTF-8", () => {
		const invalid = base62.encodeBytes(Uint8Array.from([0xff]));
		expect(() => decodeOptions(invalid)).toThrow("Payload is not valid UTF-8");
	});
});

describe("buildShareUrl", () => {
	it("encodes the share token", () => {
		expect(buildShareUrl("script-id", "a b")).toBe(
			`${SCRIPTING_API}/scripts/script-id/content?token=a%20b`,
		);
	});
});

describe("validateParameterOverrides", () => {
	const parameters = [
		{
			id: "uuid-1",
			name: "enableChat",
			default_value: true,
			type: "bool" as const,
		},
	];

	it("accepts names and ids", () => {
		expect(() =>
			validateParameterOverrides(
				[
					{ name: "enableChat", value: false },
					{ name: "uuid-1", value: true },
				],
				parameters,
			),
		).not.toThrow();
	});

	it("accepts an empty list", () => {
		expect(() => validateParameterOverrides([], parameters)).not.toThrow();
	});

	it("rejects unknown parameters", () => {
		expect(() =>
			validateParameterOverrides(
				[{ name: "missing", value: true }],
				parameters,
			),
		).toThrow(DeeplinkError);
	});
});
