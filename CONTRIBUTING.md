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

## Pull requests

- Keep changes focused.
- Update the README when user-facing behavior changes.
- Do not commit tokens, sessions, or other secrets.
- Use clear commit messages, preferably Conventional Commits.

## Reporting bugs

Use the GitHub issue templates. For security issues, follow
[SECURITY.md](SECURITY.md).

## Releasing

Configure Trusted Publishing for `.github/workflows/release.yml` on npmjs.com.
To release, bump the version, push, and create a GitHub release.
