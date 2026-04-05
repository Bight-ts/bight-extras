import { Schema } from "mongoose";
import type { StorageAdapter, StorageObject, StorageValue } from "@bight-ts/core";

interface LeanQueryLike<TValue> {
  lean: () => Promise<TValue | null>;
}

interface MongooseGlobalModelLike {
  findOne(query: { key: string; }): LeanQueryLike<{ value: StorageValue; }>;
  findOneAndUpdate(
    query: { key: string; },
    update: { value: StorageValue; },
    options: { upsert: true; },
  ): Promise<unknown>;
}

interface MongooseGuildModelLike {
  findOne(query: { guildId: string; }): LeanQueryLike<{ value: StorageValue; }>;
  findOneAndUpdate(
    query: { guildId: string; },
    update: { value: StorageObject; },
    options: { upsert: true; },
  ): Promise<unknown>;
}

export interface MongooseStorageAdapterOptions<TGlobalModel, TGuildModel> {
  connect: () => Promise<unknown>;
  globalConfigs: TGlobalModel;
  guildConfigs: TGuildModel;
}

export function createMongooseStorageSchemas() {
  return {
    globalConfigSchema: new Schema(
      {
        key: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed, required: true },
      },
      { timestamps: true },
    ),
    guildConfigSchema: new Schema(
      {
        guildId: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed, required: true },
      },
      { timestamps: true },
    ),
  };
}

export function createMongooseStorageAdapter<TGlobalModel, TGuildModel>(
  options: MongooseStorageAdapterOptions<TGlobalModel, TGuildModel>,
): StorageAdapter {
  return new MongooseStorageAdapter(options);
}

class MongooseStorageAdapter<TGlobalModel, TGuildModel> implements StorageAdapter {
  private readonly connect: () => Promise<unknown>;
  private readonly globalConfigs: MongooseGlobalModelLike;
  private readonly guildConfigs: MongooseGuildModelLike;

  constructor(options: MongooseStorageAdapterOptions<TGlobalModel, TGuildModel>) {
    this.connect = options.connect;
    this.globalConfigs = options.globalConfigs as MongooseGlobalModelLike;
    this.guildConfigs = options.guildConfigs as MongooseGuildModelLike;
  }

  async getGlobal<T extends StorageValue>(key: string): Promise<T | undefined> {
    await this.connect();
    const record = await this.globalConfigs.findOne({ key }).lean();
    return record?.value as T | undefined;
  }

  async setGlobal<T extends StorageValue>(key: string, value: T): Promise<void> {
    await this.connect();
    await this.globalConfigs.findOneAndUpdate({ key }, { value }, { upsert: true });
  }

  async getGuild<T extends StorageValue>(guildId: string, key: string): Promise<T | undefined> {
    await this.connect();
    const record = await this.guildConfigs.findOne({ guildId }).lean();
    return (record?.value as StorageObject | undefined)?.[key] as T | undefined;
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
    await this.connect();
    const record = await this.guildConfigs.findOne({ guildId }).lean();
    if (!record) {
      await this.writeGuild(guildId, defaults);
      return defaults;
    }

    const next = { ...defaults, ...(record.value as T) };
    await this.writeGuild(guildId, next);
    return next;
  }

  private async writeGuild(guildId: string, value: StorageObject) {
    await this.connect();
    await this.guildConfigs.findOneAndUpdate({ guildId }, { value }, { upsert: true });
  }
}
