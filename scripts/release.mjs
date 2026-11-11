#!/usr/bin/env node
/**
 * Bump the package version, update CHANGELOG.md, commit, tag, push, and
 * create a GitHub release. Publishing that release triggers
 * `.github/workflows/release.yml`, which publishes to npm and attaches the
 * platform binaries (tarballs + .deb on Linux, NSIS installer on Windows,
 * .pkg on macOS) to the release.
 *
 * Usage:
 *   pnpm release                      # interactive confirm
 *   pnpm release patch|minor|major
 *   pnpm release 1.2.3                # explicit version
 *   pnpm release patch --notes "..."   # override release notes
 *
 * The GitHub release page uses GitHub's auto-generated notes (--generate-notes,
 * grouped by .github/release.yml); --notes overrides them.
 * CHANGELOG.md is yours to maintain by hand: an uncommitted `## [X.Y.Z]`
 * section is folded into the release commit and used as its message body.
 *
 * Flags:
 *   --notes <text>   Override the release notes on the GitHub release
 *   --no-checks      Skip lint/typecheck/test before bumping
 *   --dry-run        Print the planned actions, change nothing
 *   --yes            Run without confirmation prompts
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as p from "@clack/prompts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const changelogPath = path.join(repoRoot, "CHANGELOG.md");

const args = process.argv.slice(2);
const takeFlag = (name) => {
	const i = args.indexOf(name);
	if (i === -1) return undefined;
	const value = args[i + 1];
	if (value === undefined || value.startsWith("--")) {
		args.splice(i, 1);
		return true;
	}
	args.splice(i, 2);
	return value;
};

const dryRun = takeFlag("--dry-run") === true;
const skipChecks = takeFlag("--no-checks") === true;
const yes = takeFlag("--yes") === true;
const notesFlag = takeFlag("--notes");
const bumpArg = args[0];

const step = (message) => p.log.step(message);
const fail = (message) => {
	p.log.error(message);
	process.exit(1);
};

/** Run a command, inheriting stdio. */
function run(cmd, cmdArgs) {
	p.log.info(`${cmd} ${cmdArgs.join(" ")}`);
	if (dryRun) return "";
	return execFileSync(cmd, cmdArgs, {
		cwd: repoRoot,
		stdio: "inherit",
		// pnpm is typically a .cmd/.ps1 shim on Windows, which cannot be
		// spawned without a shell. Its arguments here are static script
		// names, so shell interpolation is not a concern.
		shell: process.platform === "win32" && cmd === "pnpm",
	});
}

/** Run a command capturing stdout as a trimmed string. */
function capture(cmd, cmdArgs) {
	return execFileSync(cmd, cmdArgs, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

/** Compute the next version from a bump keyword or explicit version. */
function nextVersion(current, bump) {
	if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump)) return bump;
	const core = current.replace(/-.*$/, "").split(".").map(Number);
	if (core.length !== 3 || core.some(Number.isNaN)) {
		fail(`Cannot parse current version '${current}'.`);
	}
	switch (bump) {
		case "major":
			return `${core[0] + 1}.0.0`;
		case "minor":
			return `${core[0]}.${core[1] + 1}.0`;
		case "patch":
			return `${core[0]}.${core[1]}.${core[2] + 1}`;
		default:
			fail(
				`Invalid bump '${bump}' (expected patch, minor, major, or a version like 1.2.3).`,
			);
	}
}

/** Read the CHANGELOG section for a version, or null when missing. */
function changelogSection(version) {
	const lines = fs.readFileSync(changelogPath, "utf8").split(/\r?\n/);
	const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
	if (start === -1) return null;
	const body = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (lines[i].startsWith("## ")) break;
		body.push(lines[i]);
	}
	return body.join("\n").trim() || null;
}

p.intro("nulls-scripting-cli release");

// --- validate inputs & environment ------------------------------------------

if (
	!["patch", "minor", "major"].includes(bumpArg) &&
	!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bumpArg ?? "")
) {
	fail(
		"Pass a bump (patch, minor, major) or an explicit version (e.g. 1.2.3).",
	);
}

try {
	capture("git", ["rev-parse", "--git-dir"]);
} catch {
	fail("Not a git repository.");
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const currentVersion = pkg.version;
if (!currentVersion) fail("package.json has no version.");

const version = nextVersion(currentVersion, bumpArg);
const tag = `v${version}`;
const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);

// Only CHANGELOG.md may carry uncommitted changes — they are included in
// the release commit so the changelog can be prepared without a separate
// commit. Everything else must be committed or stashed.
const dirty = capture("git", ["status", "--porcelain"])
	.split(/\r?\n/)
	.filter((line) => line.trim() && !/ CHANGELOG\.md$/.test(line));
if (!dryRun && dirty.length > 0)
	fail("Working tree is not clean. Commit or stash your changes first.");
if (capture("git", ["tag", "-l", tag])) fail(`Tag ${tag} already exists.`);
try {
	capture("gh", ["--version"]);
} catch {
	fail(
		"GitHub CLI (gh) is required to create the release. Install it from https://cli.github.com/",
	);
}

// --- release notes -----------------------------------------------------------

// The GitHub release page shows GitHub's auto-generated notes unless --notes
// overrides them. A hand-written CHANGELOG.md section for the version is
// folded into the release commit message body instead.
const notes =
	typeof notesFlag === "string" && notesFlag.trim() ? notesFlag.trim() : null;
const changelogNotes = notes === null ? changelogSection(version) : null;

// --- plan --------------------------------------------------------------------

for (const line of [
	`version   ${currentVersion} -> ${version}`,
	`branch    ${branch}`,
	`commit    chore(release): ${tag}`,
	`tag       ${tag}`,
	`notes     ${notes === null ? "auto-generated by GitHub (--notes to override)" : "provided"}`,
	`changelog ${changelogNotes === null ? "no section" : "section used in commit body"}`,
	`push      origin ${branch} ${tag}`,
	`release   gh release create ${tag}`,
]) {
	p.log.message(line);
}

if (!yes) {
	const proceed = await p.confirm({
		message: "Proceed?",
		active: "yes",
		inactive: "no",
	});
	if (p.isCancel(proceed) || !proceed) fail("Aborted.");
}

// --- checks ------------------------------------------------------------------

if (!skipChecks) {
	const s = p.spinner();
	s.start("Running lint, typecheck and tests");
	try {
		for (const check of ["lint", "typecheck", "test"]) {
			s.message(`Running ${check}`);
			run("pnpm", ["run", check]);
		}
		s.stop("Checks passed");
	} catch {
		s.stop("Checks failed", 1);
		fail("Fix the failing checks before releasing.");
	}
} else {
	step("Skipping checks (--no-checks)");
}

// --- bump --------------------------------------------------------------------

step(`Bumping version to ${version}`);
if (!dryRun) {
	const raw = fs.readFileSync(pkgPath, "utf8");
	const bumped = raw.replace(/("version":\s*)"[^"]+"/, `$1"${version}"`);
	if (bumped === raw) fail("Could not update the version in package.json.");
	fs.writeFileSync(pkgPath, bumped);
}

step(`Creating commit chore(release): ${tag}`);
run("git", ["add", "package.json", "CHANGELOG.md"]);
run("git", [
	"commit",
	"-m",
	`chore(release): ${tag}`,
	"-m",
	notes ?? changelogNotes ?? `Version ${version}.`,
]);

step(`Tagging ${tag}`);
run("git", ["tag", "-a", tag, "-m", tag]);

step(`Pushing ${branch} and ${tag} to origin`);
run("git", ["push", "origin", branch, tag]);

// --- release ------------------------------------------------------------------

step(`Creating GitHub release ${tag}`);
run("gh", [
	"release",
	"create",
	tag,
	"--title",
	tag,
	...(notes === null ? ["--generate-notes"] : ["--notes", notes]),
	"--latest",
]);

p.outro(
	dryRun
		? "Dry run complete — nothing was changed."
		: `Released ${tag}. Binaries will appear on the release as CI finishes.`,
);
