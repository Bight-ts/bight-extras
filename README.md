# Bight.ts Extras

This repository publishes the official optional batteries that sit on top of `@bight-ts/core`.

## What This Repo Publishes

### Storage

- `@bight-ts/storage-json`
- `@bight-ts/storage-keyv`
- `@bight-ts/storage-drizzle`
- `@bight-ts/storage-prisma`
- `@bight-ts/storage-mongoose`

### Plugins

- `@bight-ts/plugin-devtools`
- `@bight-ts/plugin-message-commands`
- `@bight-ts/plugin-ops`
- `@bight-ts/plugin-prefix-commands`
- `@bight-ts/plugin-scheduler`

### Services And Helpers

- `@bight-ts/settings`
- `@bight-ts/i18n`
- `@bight-ts/toolkit`

## Relationship To Core

This repo depends on the published `@bight-ts/core` package from `bight-ts`.

Release order matters:

1. publish `@bight-ts/core`
2. publish changed extras packages
3. publish `create-bight`

For local integration work before a core release exists, set `BIGHT_CORE_PACKAGE_SPEC` to a local tarball or folder before installing.

## Local Development

CI runs on Node 22 and `pnpm@10.33.0`.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:all
```

## Contributing

Contributions are welcome! Please read the [contributing guidelines](CONTRIBUTING.md) before submitting a pull request.
