import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorage, type StorageAdapter, type StorageValue } from "@bight-ts/core";

export interface StorageAdapterHarness {
  createAdapter: () => Promise<StorageAdapter> | StorageAdapter;
  cleanup?: () => Promise<void> | void;
}

export function runStorageAdapterContractSuite(
  name: string,
  harness: StorageAdapterHarness,
) {
  describe(name, () => {
    let adapter: StorageAdapter;

    beforeEach(async () => {
      adapter = await harness.createAdapter();
    });

    afterEach(async () => {
      await harness.cleanup?.();
    });

    it("returns undefined for missing global keys", async () => {
      const storage = createStorage(adapter);

      expect(await storage.global.get("missing")).toBeUndefined();
    });

    it("round-trips global primitives, arrays, objects, and null", async () => {
      const storage = createStorage(adapter);
      const payload = {
        array: [1, 2, 3] satisfies StorageValue[],
        boolean: true,
        nullValue: null,
        object: {
          enabled: true,
          prefix: "!",
        } satisfies StorageValue,
        string: "hello",
      };

      await storage.global.set("string", payload.string);
      await storage.global.set("boolean", payload.boolean);
      await storage.global.set("nullValue", payload.nullValue);
      await storage.global.set("array", payload.array);
      await storage.global.set("object", payload.object);

      expect(await storage.global.get<string>("string")).toBe(payload.string);
      expect(await storage.global.get<boolean>("boolean")).toBe(payload.boolean);
      expect(await storage.global.get<null>("nullValue")).toBeNull();
      expect(await storage.global.get<number[]>("array")).toEqual(payload.array);
      expect(await storage.global.get<typeof payload.object>("object")).toEqual(payload.object);
    });

    it("returns undefined for missing guild keys", async () => {
      const storage = createStorage(adapter);

      expect(await storage.guilds.get("guild-1", "missing")).toBeUndefined();
    });

    it("round-trips guild values", async () => {
      const storage = createStorage(adapter);

      await storage.guilds.set("guild-1", "prefix", "!");
      await storage.guilds.set("guild-1", "enabled", true);

      expect(await storage.guilds.get<string>("guild-1", "prefix")).toBe("!");
      expect(await storage.guilds.get<boolean>("guild-1", "enabled")).toBe(true);
    });

    it("patchGuild performs a shallow merge", async () => {
      const storage = createStorage(adapter);

      await storage.guilds.patch("guild-1", {
        nested: {
          enabled: true,
          prefix: "!",
        },
        theme: "dark",
      });

      const updated = await storage.guilds.patch("guild-1", {
        nested: {
          prefix: "?",
        },
      });

      expect(updated).toEqual({
        nested: {
          prefix: "?",
        },
        theme: "dark",
      });
      expectNoUndefined(updated);
    });

    it("ensureGuild overlays defaults under existing values", async () => {
      const storage = createStorage(adapter);

      await storage.guilds.patch("guild-1", {
        prefix: "!",
      });

      const config = await storage.guilds.ensure("guild-1", {
        enabled: true,
        prefix: "?",
      });

      expect(config).toEqual({
        enabled: true,
        prefix: "!",
      });
      expect(await storage.guilds.get<boolean>("guild-1", "enabled")).toBe(true);
      expectNoUndefined(config);
    });

    it("keeps global and guild data isolated", async () => {
      const storage = createStorage(adapter);

      await storage.global.set("prefix", "global-prefix");
      await storage.guilds.set("guild-1", "prefix", "guild-prefix");

      expect(await storage.global.get<string>("prefix")).toBe("global-prefix");
      expect(await storage.guilds.get<string>("guild-1", "prefix")).toBe("guild-prefix");
    });

    it("keeps guild data isolated by guild id", async () => {
      const storage = createStorage(adapter);

      await storage.guilds.set("guild-1", "prefix", "!");
      await storage.guilds.set("guild-2", "prefix", "?");

      expect(await storage.guilds.get<string>("guild-1", "prefix")).toBe("!");
      expect(await storage.guilds.get<string>("guild-2", "prefix")).toBe("?");
    });
  });
}

function expectNoUndefined(value: StorageValue) {
  if (Array.isArray(value)) {
    for (const item of value) {
      expect(item).not.toBeUndefined();
      expectNoUndefined(item);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      expect(nestedValue).not.toBeUndefined();
      expectNoUndefined(nestedValue);
    }
  }
}
