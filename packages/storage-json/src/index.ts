import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StorageAdapter, StorageObject, StorageValue } from "@bight-ts/core";

interface JsonDatabase {
  global: Record<string, StorageValue>;
  guilds: Record<string, Record<string, StorageValue>>;
}

export interface JsonStorageAdapterOptions {
  filePath: string;
}

export class JsonStorageAdapter implements StorageAdapter {
  constructor(private readonly options: JsonStorageAdapterOptions) { }

  async getGlobal<T extends StorageValue>(key: string): Promise<T | undefined> {
    const database = await this.readDatabase();
    return database.global[key] as T | undefined;
  }

  async setGlobal<T extends StorageValue>(key: string, value: T): Promise<void> {
    const database = await this.readDatabase();
    database.global[key] = value;
    await this.writeDatabase(database);
  }

  async getGuild<T extends StorageValue>(
    guildId: string,
    key: string,
  ): Promise<T | undefined> {
    const database = await this.readDatabase();
    return database.guilds[guildId]?.[key] as T | undefined;
  }

  async setGuild<T extends StorageValue>(
    guildId: string,
    key: string,
    value: T,
  ): Promise<void> {
    const database = await this.readDatabase();
    database.guilds[guildId] ??= {};
    database.guilds[guildId][key] = value;
    await this.writeDatabase(database);
  }

  async patchGuild<T extends StorageObject>(guildId: string, patch: Partial<T>): Promise<T> {
    const database = await this.readDatabase();
    const current = (database.guilds[guildId] ?? {}) as T;
    const next = { ...current, ...patch } as T;
    database.guilds[guildId] = next;
    await this.writeDatabase(database);
    return next;
  }

  async ensureGuild<T extends StorageObject>(guildId: string, defaults: T): Promise<T> {
    const database = await this.readDatabase();
    const current = (database.guilds[guildId] ?? {}) as T;
    const next = { ...defaults, ...current };
    database.guilds[guildId] = next;
    await this.writeDatabase(database);
    return next as T;
  }

  private async readDatabase(): Promise<JsonDatabase> {
    try {
      const raw = await readFile(this.options.filePath, "utf8");
      return JSON.parse(raw) as JsonDatabase;
    } catch {
      const database: JsonDatabase = { global: {}, guilds: {} };
      await this.writeDatabase(database);
      return database;
    }
  }

  private async writeDatabase(database: JsonDatabase): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true });
    await writeFile(this.options.filePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  }
}
