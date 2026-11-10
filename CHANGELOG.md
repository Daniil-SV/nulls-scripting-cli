# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
