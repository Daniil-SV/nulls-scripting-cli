import { describe, expect, it } from "vitest";
import {
	Base62,
	decodeBigInt,
	decodeBytes,
	decodeInteger,
	decodeString,
	encodeBigInt,
	encodeBytes,
	encodeInteger,
	encodeString,
} from "@/shared/base62.js";

describe("Base62", () => {
	it("round-trips strings", () => {
		for (const value of ["", "hello", "Null's Brawl", "🙂 unicode", "\0"]) {
			expect(decodeString(encodeString(value))).toBe(value);
		}
	});

	it("round-trips integers", () => {
		for (const value of [0, 1, 61, 62, 123_456, Number.MAX_SAFE_INTEGER]) {
			expect(decodeInteger(encodeInteger(value))).toBe(value);
		}
	});

	it("round-trips bigints", () => {
		for (const value of [0n, 1n, 62n, 2n ** 128n]) {
			expect(decodeBigInt(encodeBigInt(value))).toBe(value);
		}
	});

	it("round-trips bytes", () => {
		for (const bytes of [[], [0], [0, 0, 1], [0, 1, 2, 127, 128, 255], [255]]) {
			const value = Uint8Array.from(bytes);
			expect(decodeBytes(encodeBytes(value))).toEqual(value);
		}
	});

	it("preserves leading zero bytes", () => {
		expect(encodeBytes(Uint8Array.from([0, 0, 1]))).toBe("001");
		expect(decodeBytes("001")).toEqual(Uint8Array.from([0, 0, 1]));
		expect(encodeBytes(Uint8Array.from([]))).toBe("");
	});

	it("rejects negative integers", () => {
		expect(() => encodeInteger(-1)).toThrow(TypeError);
		expect(() => encodeBigInt(-1n)).toThrow(TypeError);
	});

	it("rejects non-integer and unsafe integers", () => {
		expect(() => encodeInteger(1.5)).toThrow(TypeError);
		expect(() => encodeInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
		expect(() => decodeInteger("z".repeat(20))).toThrow(TypeError);
	});

	it("rejects characters outside the alphabet", () => {
		expect(() => decodeInteger("!")).toThrow(TypeError);
	});

	it("rejects invalid alphabets", () => {
		expect(() => new Base62("0")).toThrow(TypeError);
		expect(() => new Base62("001")).toThrow(TypeError);
	});

	it("supports custom alphabets", () => {
		const base62 = new Base62(
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
		);
		expect(base62.decodeInteger(base62.encodeInteger(1234))).toBe(1234);
	});

	it("uses the custom alphabet length as the base", () => {
		const hex = new Base62("0123456789abcdef");
		expect(hex.encodeInteger(255)).toBe("ff");
		expect(hex.decodeInteger("ff")).toBe(255);
	});
});
