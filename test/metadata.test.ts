import { describe, expect, it } from "vitest";
import { UsageError } from "@/errors.js";
import {
	metadataFromConfig,
	SCRIPT_DESCRIPTION_MAX,
	SCRIPT_DESCRIPTION_MIN,
	SCRIPT_NAME_MAX,
	SCRIPT_NAME_MIN,
	validateMetadata,
} from "@/shared/metadata.js";

describe("metadataFromConfig", () => {
	it("returns an empty object for an empty config", () => {
		expect(metadataFromConfig({})).toEqual({});
	});

	it("copies name and description", () => {
		expect(
			metadataFromConfig({ name: "Name", description: "Description" }),
		).toEqual({ name: "Name", description: "Description" });
	});

	it("treats a blank description as a clear request", () => {
		expect(metadataFromConfig({ description: "   " })).toEqual({
			description: null,
		});
	});
});

describe("validateMetadata", () => {
	it("accepts valid values", () => {
		expect(() =>
			validateMetadata({ name: "abc", description: "a".repeat(32) }),
		).not.toThrow();
	});

	it("accepts a missing description", () => {
		expect(() => validateMetadata({ name: "abc" })).not.toThrow();
	});

	it("accepts clearing the description", () => {
		expect(() => validateMetadata({ description: null })).not.toThrow();
	});

	it("accepts the exact boundaries", () => {
		expect(() =>
			validateMetadata({
				name: "a".repeat(SCRIPT_NAME_MIN),
				description: "a".repeat(SCRIPT_DESCRIPTION_MIN),
			}),
		).not.toThrow();

		expect(() =>
			validateMetadata({
				name: "a".repeat(SCRIPT_NAME_MAX),
				description: "a".repeat(SCRIPT_DESCRIPTION_MAX),
			}),
		).not.toThrow();
	});

	it("rejects a name shorter than the minimum", () => {
		expect(() =>
			validateMetadata({ name: "a".repeat(SCRIPT_NAME_MIN - 1) }),
		).toThrow(UsageError);
	});

	it("rejects a name longer than the maximum", () => {
		expect(() =>
			validateMetadata({ name: "a".repeat(SCRIPT_NAME_MAX + 1) }),
		).toThrow(UsageError);
	});

	it("rejects a description shorter than the minimum", () => {
		expect(() =>
			validateMetadata({ description: "a".repeat(SCRIPT_DESCRIPTION_MIN - 1) }),
		).toThrow(UsageError);
	});

	it("rejects a description longer than the maximum", () => {
		expect(() =>
			validateMetadata({ description: "a".repeat(SCRIPT_DESCRIPTION_MAX + 1) }),
		).toThrow(UsageError);
	});

	it("reports every problem at once", () => {
		expect(() => validateMetadata({ name: "a", description: "b" })).toThrow(
			/name must be 3-32 characters[\s\S]*description must be 32-1024 characters/,
		);
	});
});
