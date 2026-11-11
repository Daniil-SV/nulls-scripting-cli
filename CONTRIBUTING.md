# Contributing

## Setup

```sh
pnpm install
pnpm build
```

Run a command from source:

```sh
pnpm exec tsx bin/dev.js list
```

Regenerate API types after changing `schema/openapi*.yaml`:

```sh
pnpm generate:api
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Testing CI locally with act

Workflows can be exercised locally with
[act](https://github.com/nektos/act) (requires Docker):

```sh
act push -j lint
act push -j build --matrix os:ubuntu-latest
act workflow_dispatch -j binaries --matrix target:linux
```

act runs jobs in Linux containers, so only the Linux legs of the OS matrices
can run locally; Windows and macOS legs are executed by GitHub Actions.
`.actrc` pins the runner image act uses.

## Pull requests

- Keep changes focused.
- Update the README when user-facing behavior changes.
- Do not commit tokens, sessions, or other secrets.
- Use clear commit messages, preferably Conventional Commits.

## Reporting bugs

Use the GitHub issue templates. For security issues, follow
[SECURITY.md](SECURITY.md).

## Releasing

Configure Trusted Publishing for `.github/workflows/release.yml` on npmjs.com
and install the [GitHub CLI](https://cli.github.com/) (`gh`), then authenticate
with `gh auth login`.

From a clean `main` branch:

```sh
pnpm release            # interactive: review the plan, confirm
pnpm release patch
pnpm release patch --dry-run   # preview only
```

Optionally prepare a `## [X.Y.Z]` section in `CHANGELOG.md` first —
uncommitted changelog edits are folded into the release commit, and the
section becomes the commit message body. The GitHub release page always uses
GitHub's auto-generated notes (grouped by `.github/release.yml` categories)
unless you pass `--notes "..."` to override them.

The script runs lint/typecheck/test, bumps `package.json`, commits
`chore(release): vX.Y.Z`, tags `vX.Y.Z`, pushes, and creates the GitHub
release.

Publishing the release triggers `.github/workflows/release.yml`:

- npm publish with provenance
- binaries built per platform and attached to the release:
  - Linux (Ubuntu): `.tar.gz`/`.tar.xz` tarballs for all targets + `.deb`
    packages
  - Windows: NSIS installer `.exe` for x64 and ARM64 (see
    `scripts/nsis.nsi`), cross-built on Ubuntu with NSIS + 7zip — Windows'
    bundled bsdtar lacks the `--force-local` flag oclif needs
  - macOS (`.pkg`) for x64 and ARM64
