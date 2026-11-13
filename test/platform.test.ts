import { describe, expect, it } from "vitest";
import { matchesName } from "@/shared/platform.js";

describe("matchesName", () => {
	it("matches names regardless of separators", () => {
		expect(matchesName("MuMuPlayer", ["MuMuPlayer"])).toBe(true);
		expect(matchesName("MuMuPlayer-12.0", ["MuMuPlayer"])).toBe(true);
		expect(matchesName("MuMuPlayer 12", ["MuMuPlayer"])).toBe(true);
	});

	it("matches version suffixes but not unrelated prefixes", () => {
		expect(matchesName("MuMuPlayer12", ["MuMuPlayer"])).toBe(true);
		expect(matchesName("MuMuPlayerSomething", ["MuMuPlayer"])).toBe(false);
		expect(matchesName("MuMuPlayerGlobal", ["MuMuPlayer"])).toBe(false);
	});

	it("matches aliases", () => {
		expect(
			matchesName("MuMuPlayer Pro", ["MuMuPlayer", "MuMuPlayer Pro"]),
		).toBe(true);
	});
});
