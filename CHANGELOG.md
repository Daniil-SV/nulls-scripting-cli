# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-13

### Added

- `nbs init` for interactive project setup: creates the script, writes
  `nbsproject.toml`, and can configure parameters and a device.
- `nbs init --device` writes a local `.nbsrc` device config.
- `nbs sync` applies script name and description from the project config, with
  `--dry-run` and `--json`.
- `nbs parameters` (alias `nbs params`) to configure script parameters.
- Config loading from `nbsproject.*` and `.nbsrc.*` in the project root and
  `.config/`, supporting TOML (including extensionless files such as `.nbsrc`),
  JSON and JavaScript, and `nbs` field in `package.json` files.
- Global `--id` and `--path` flags for selecting the target script and file.
- MuMuPlayer detection, instance selection, launch and automatic ADB host and
  port discovery.
- Example project in `examples/hello_wolrd`.

### Changed

- `content set` and `publish` read the target from the config or `--id`/`--path`
  instead of positional arguments.
- `content get` uses the shared `--id` flag or the project config.
- Missing or foreign scripts can be forked into an owned script, and the config
  id is updated.
- `content set --watch` processes updates one at a time, keeps a stable spinner
  with the last update time, and no longer clears the screen or prints device
  logs.
- Replaced `uuid-validate` with an internal UUID check.

### Removed

- Positional script name and path arguments for `content set` and `publish`.
- `content get --name` and `content get --uuid`.
- `publish --update`.
- Public `initializeConfig` and `resolvePath` exports.

## [0.1.2] - 2026-11-10

### Changed

- Fixed nbs config locations to search and fixed config path resolving

## [0.1.1] - 2026-11-10

### Changed

- Bump GitHub Actions: `actions/checkout` v4→v7, `actions/setup-node` v4→v7,
  `pnpm/action-setup` v4→v6.
- Bump `@biomejs/biome` 2.6.3→2.6.6, `tsc-alias` ^1.9.9→^1.9.10.
- Bump `@oclif/core` ^5.1.10→^5.1.11, `@oclif/plugin-help` ^7.0.6→^7.0.7.
- Bump `vitest` ^4.1.12→^5.1.0.
- Bump `which` ^6.0.1→^7.0.0 and update minimum Node.js to >=22.22.2.
- Set up CI publishing with npm Trusted Publishing and provenance.

## [0.1.0] - 2026-11-10

### Added

- `nbs` CLI with `list`, `whoami`, `content get`, `content set`, `publish`, and
  `logout` commands.
- Script content watch mode and friendly battle deeplinks.
- Optional adb device support with PATH and emulator-directory fallback.
- Public package exports for the scripting and Connect APIs.
