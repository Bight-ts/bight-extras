# Contributing

## Repo Shape

- `packages/*` contains the published extras packages
- `testing/storage-contract.ts` is the shared storage adapter contract suite
- `docs/storage-contract-guarantees.md` records the adapter guarantees maintainers must keep

## Environment

- CI uses Node 22
- packages declare support for Node `>=20`
- the repo uses `pnpm@10.33.0`

## Local Workflow

If `@bight-ts/core` is not published yet, point installs at a local core tarball before installing:

```bash
export BIGHT_CORE_PACKAGE_SPEC=file:/absolute/path/to/bight-core-0.1.0.tgz
pnpm install
```

Then run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:all
```

## Pull Requests

- keep changes scoped to the packages you are touching
- avoid unrelated rewrites
- add or update tests when behavior changes
- explain package impact in the PR description
- add a Changeset for every user-facing package change

## Changesets

Create a Changeset when a published package changes:

```bash
pnpm changeset
```

Rules:

- package behavior changes need a Changeset
- docs-only or repo-only maintenance can skip it
- one PR can include one Changeset that touches multiple packages
- the release PR generated on `main` is the source of truth for final published versions

## Release Flow

This repo publishes through Changesets.

1. merge package changes and Changesets into `main`
2. let the release workflow open or update the release PR
3. review the release PR carefully
4. make sure `@bight-ts/core` is already available on npm
5. merge the release PR to publish

The publish step is guarded so it fails if `@bight-ts/core` is not yet available on npm.

## Core Vs Extras

Changes belong in `bight-ts` when they alter the runtime contracts or execution model.
Changes belong here when they add optional batteries, storage adapters, plugins, service helpers, or app-facing utilities.
