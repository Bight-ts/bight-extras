# Storage Contract Guarantees

This file is an internal maintainer note for Bight storage adapters.

It defines the behavior every official storage adapter must preserve.

## Required behavior

- `storage.global.get(key)` returns `undefined` for missing keys
- `storage.global.set(key, value)` round-trips valid `StorageValue` payloads
- `storage.guilds.get(guildId, key)` returns `undefined` for missing keys
- `storage.guilds.set(guildId, key, value)` round-trips valid `StorageValue` payloads
- `storage.guilds.patch(guildId, patch)` performs a shallow merge
- `storage.guilds.ensure(guildId, defaults)` overlays defaults under existing values and persists the merged result
- global data and guild data are isolated from each other
- guild data is isolated by guild id
- nested objects are replaced at the patched key, not deep-merged

## Value rules

- stored values must fit `StorageValue`
- adapters should not invent extra wrapper objects around returned values
- adapters should not return `undefined` inside stored payloads
- adapters may serialize internally, but the public contract must behave the same

## App seam rules

- Bight owns adapter behavior
- apps still own `src/storage/index.ts`
- apps still own `src/storage/adapter.ts`
- ORM-backed apps still own connection wiring and schema placement where needed

## Maintainer check

Before changing a storage adapter:

1. run the shared storage contract suite
2. run the adapter-specific tests
3. confirm generator output still uses a thin app-owned wrapper
4. update lessons/backlog if semantics changed
