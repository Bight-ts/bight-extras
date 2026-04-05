import { createStorage, type StorageAdapter } from "@bight-ts/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createGlobalSettingService,
  createGuildSettingsService,
  SettingsValidationError,
} from "../src/index.js";

function createMemoryStorage() {
  const global = new Map<string, unknown>();
  const guilds = new Map<string, Record<string, unknown>>();

  const adapter: StorageAdapter = {
    async getGlobal(key) {
      return global.get(key) as never;
    },
    async setGlobal(key, value) {
      global.set(key, value);
    },
    async getGuild(guildId, key) {
      return guilds.get(guildId)?.[key] as never;
    },
    async setGuild(guildId, key, value) {
      const current = guilds.get(guildId) ?? {};
      current[key] = value;
      guilds.set(guildId, current);
    },
    async patchGuild(guildId, patch) {
      const current = guilds.get(guildId) ?? {};
      const next = {
        ...current,
        ...patch,
      };
      guilds.set(guildId, next);
      return next as never;
    },
    async ensureGuild(guildId, defaults) {
      const current = guilds.get(guildId) ?? {};
      const next = {
        ...defaults,
        ...current,
      };
      guilds.set(guildId, next);
      return next as never;
    },
  };

  return createStorage(adapter);
}

describe("@bight-ts/settings", () => {
  it("writes defaults when guild settings are missing and namespaces by key", async () => {
    const storage = createMemoryStorage();
    const appSettings = createGuildSettingsService({
      storage,
      key: "app",
      defaults: {
        prefix: "!",
        featureFlags: {},
      },
    });
    const moderationSettings = createGuildSettingsService({
      storage,
      key: "moderation",
      defaults: {
        enabled: false,
      },
    });

    expect(await appSettings.get("guild-1")).toEqual({
      prefix: "!",
      featureFlags: {},
    });
    expect(await moderationSettings.get("guild-1")).toEqual({
      enabled: false,
    });
  });

  it("updates, overwrites, and resets guild settings with shallow merges", async () => {
    const storage = createMemoryStorage();
    const settings = createGuildSettingsService({
      storage,
      key: "app",
      defaults: {
        prefix: "!",
        featureFlags: {
          beta: false,
        },
      },
    });

    expect(
      await settings.update("guild-1", {
        prefix: "?",
        featureFlags: {
          beta: true,
        },
      }),
    ).toEqual({
      prefix: "?",
      featureFlags: {
        beta: true,
      },
    });

    expect(
      await settings.set("guild-1", {
        prefix: "$",
        featureFlags: {},
      }),
    ).toEqual({
      prefix: "$",
      featureFlags: {},
    });

    expect(await settings.reset("guild-1")).toEqual({
      prefix: "!",
      featureFlags: {
        beta: false,
      },
    });
  });

  it("returns default global settings and validates schemas", async () => {
    const storage = createMemoryStorage();
    const setting = createGlobalSettingService({
      storage,
      key: "maintenance",
      defaultValue: {
        enabled: false,
      },
      schema: z.object({
        enabled: z.boolean(),
      }),
    });

    expect(await setting.get()).toEqual({ enabled: false });
    await expect(setting.set({ enabled: "nope" } as never)).rejects.toBeInstanceOf(
      SettingsValidationError,
    );
  });

  it("migrates stored values before validation", async () => {
    const storage = createMemoryStorage();
    await storage.global.set("prefix", "!");

    const setting = createGlobalSettingService({
      storage,
      key: "prefix",
      defaultValue: {
        value: "?",
      },
      schema: z.object({
        value: z.string().min(1),
      }),
      migrate(value) {
        if (typeof value === "string") {
          return {
            value,
          };
        }

        return value as never;
      },
    });

    expect(await setting.get()).toEqual({
      value: "!",
    });
  });

  it("rejects invalid stored guild shapes instead of silently resetting them", async () => {
    const storage = createMemoryStorage();
    await storage.guilds.set("guild-1", "app", "broken" as never);

    const settings = createGuildSettingsService({
      storage,
      key: "app",
      defaults: {
        prefix: "!",
      },
      schema: z.object({
        prefix: z.string().min(1),
      }),
    });

    await expect(settings.get("guild-1")).rejects.toBeInstanceOf(SettingsValidationError);
  });
});
