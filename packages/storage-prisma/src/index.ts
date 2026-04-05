import type { StorageAdapter, StorageObject, StorageValue } from "@bight-ts/core";

interface PrismaGlobalDelegateLike {
  findUnique(args: { where: { key: string; }; }): Promise<{ value: StorageValue; } | null>;
  upsert(args: {
    where: { key: string; };
    create: { key: string; value: StorageValue; };
    update: { value: StorageValue; };
  }): Promise<unknown>;
}

interface PrismaGuildDelegateLike {
  findUnique(args: { where: { guildId: string; }; }): Promise<{ value: StorageValue; } | null>;
  upsert(args: {
    where: { guildId: string; };
    create: { guildId: string; value: StorageValue; };
    update: { value: StorageValue; };
  }): Promise<unknown>;
}

export interface PrismaStorageAdapterOptions<TGlobalDelegate, TGuildDelegate> {
  globalConfigs: TGlobalDelegate;
  guildConfigs: TGuildDelegate;
}

export function createPrismaStorageAdapter<TGlobalDelegate, TGuildDelegate>(
  options: PrismaStorageAdapterOptions<TGlobalDelegate, TGuildDelegate>,
): StorageAdapter {
  return new PrismaStorageAdapter(options);
}

class PrismaStorageAdapter<TGlobalDelegate, TGuildDelegate> implements StorageAdapter {
  private readonly globalConfigs: PrismaGlobalDelegateLike;
  private readonly guildConfigs: PrismaGuildDelegateLike;

  constructor(options: PrismaStorageAdapterOptions<TGlobalDelegate, TGuildDelegate>) {
    this.globalConfigs = options.globalConfigs as PrismaGlobalDelegateLike;
    this.guildConfigs = options.guildConfigs as PrismaGuildDelegateLike;
  }

  async getGlobal<T extends StorageValue>(key: string): Promise<T | undefined> {
    const record = await this.globalConfigs.findUnique({ where: { key } });
    return record?.value as T | undefined;
  }

  async setGlobal<T extends StorageValue>(key: string, value: T): Promise<void> {
    await this.globalConfigs.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async getGuild<T extends StorageValue>(guildId: string, key: string): Promise<T | undefined> {
    const record = await this.guildConfigs.findUnique({ where: { guildId } });
    return (record?.value as StorageObject | null)?.[key] as T | undefined;
  }

  async setGuild<T extends StorageValue>(guildId: string, key: string, value: T): Promise<void> {
    const current = await this.ensureGuild(guildId, {} as StorageObject);
    await this.writeGuild(guildId, { ...current, [key]: value });
  }

  async patchGuild<T extends StorageObject>(guildId: string, patch: Partial<T>): Promise<T> {
    const current = await this.ensureGuild(guildId, {} as T);
    const next = { ...current, ...patch };
    await this.writeGuild(guildId, next);
    return next;
  }

  async ensureGuild<T extends StorageObject>(guildId: string, defaults: T): Promise<T> {
    const record = await this.guildConfigs.findUnique({ where: { guildId } });
    if (!record) {
      await this.writeGuild(guildId, defaults);
      return defaults;
    }

    const next = { ...defaults, ...(record.value as T) };
    await this.writeGuild(guildId, next);
    return next;
  }

  private async writeGuild(guildId: string, value: StorageObject) {
    await this.guildConfigs.upsert({
      where: { guildId },
      create: { guildId, value },
      update: { value },
    });
  }
}
