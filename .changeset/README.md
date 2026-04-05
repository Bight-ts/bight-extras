# Changesets

Use Changesets in this repo for versioning and package release PRs.

Create a release note entry with:

```bash
pnpm changeset
```

Notes:

- every user-facing package change needs a Changeset
- the release PR created on `main` becomes the source of truth for final versions
- for the first public release, you still need at least one initial Changeset covering the packages you want to publish
