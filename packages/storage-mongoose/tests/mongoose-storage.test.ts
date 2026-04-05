import { describe, expect, it, vi } from "vitest";
import type { StorageObject, StorageValue } from "@bight-ts/core";
import { runStorageAdapterContractSuite } from "../../../testing/storage-contract.js";
import {
  createMongooseStorageAdapter,
  createMongooseStorageSchemas,
} from "../src/index.js";

runStorageAdapterContractSuite("MongooseStorageAdapter contract", {
  createAdapter() {
    const connect = vi.fn(async () => undefined);
    const models = createFakeMongooseModels();

    return createMongooseStorageAdapter({
      connect,
      globalConfigs: models.globalConfigs,
      guildConfigs: models.guildConfigs,
    });
  },
});

describe("createMongooseStorageAdapter", () => {
  it("invokes the provided connect callback", async () => {
    const connect = vi.fn(async () => undefined);
    const models = createFakeMongooseModels();
    const adapter = createMongooseStorageAdapter({
      connect,
      globalConfigs: models.globalConfigs,
      guildConfigs: models.guildConfigs,
    });

    await adapter.setGlobal("count", 1);
    await adapter.getGuild("guild-1", "prefix");

    expect(connect).toHaveBeenCalledTimes(2);
  });
});

describe("createMongooseStorageSchemas", () => {
  it("creates the expected GlobalConfig and GuildConfig schemas", () => {
    const schemas = createMongooseStorageSchemas();

    expect(schemas.globalConfigSchema.path("key")).toBeDefined();
    expect(schemas.globalConfigSchema.path("value")).toBeDefined();
    expect(schemas.guildConfigSchema.path("guildId")).toBeDefined();
    expect(schemas.guildConfigSchema.path("value")).toBeDefined();
  });
});

function createFakeMongooseModels() {
  const global = new Map<string, StorageValue>();
  const guilds = new Map<string, StorageObject>();

  return {
    globalConfigs: {
      findOne({ key }: { key: string; }) {
        return {
          lean: async () => {
            if (!global.has(key)) {
              return null;
            }

            return {
              value: global.get(key),
            };
          },
        };
      },
      async findOneAndUpdate(
        { key }: { key: string; },
        { value }: { value: StorageValue; },
      ) {
        global.set(key, value);
      },
    },
    guildConfigs: {
      findOne({ guildId }: { guildId: string; }) {
        return {
          lean: async () => {
            if (!guilds.has(guildId)) {
              return null;
            }

            return {
              value: guilds.get(guildId),
            };
          },
        };
      },
      async findOneAndUpdate(
        { guildId }: { guildId: string; },
        { value }: { value: StorageObject; },
      ) {
        guilds.set(guildId, value);
      },
    },
  };
}
