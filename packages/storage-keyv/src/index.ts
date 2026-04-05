import { createRequire } from "node:module";
import Keyv from "keyv";
import type { StorageAdapter, StorageObject, StorageValue } from "@bight-ts/core";

const require = createRequire(import.meta.url);

export interface KeyvStorageAdapterOptions {
  keyv?: Keyv<StorageValue>;
  url?: string;
  namespace?: string;
}

export class KeyvStorageAdapter implements StorageAdapter {
  private readonly keyv: Keyv<StorageValue>;
  private readonly namespace: string;

  constructor(options: KeyvStorageAdapterOptions = {}) {
    this.keyv = options.keyv ?? createKeyvClient(options.url);
    this.namespace = options.namespace ?? "bight";
  }

  async getGlobal<T extends StorageValue>(key: string): Promise<T | undefined> {
    return (await this.keyv.get(this.createKey("global", key))) as T | undefined;
  }

  async setGlobal<T extends StorageValue>(key: string, value: T): Promise<void> {
    await this.keyv.set(this.createKey("global", key), value);
  }

  async getGuild<T extends StorageValue>(
    guildId: string,
    key: string,
  ): Promise<T | undefined> {
    const current = await this.readGuildObject(guildId);
    return current[key] as T | undefined;
  }

  async setGuild<T extends StorageValue>(
    guildId: string,
    key: string,
    value: T,
  ): Promise<void> {
    const current = await this.readGuildObject(guildId);
    await this.writeGuildObject(guildId, { ...current, [key]: value });
  }

  async patchGuild<T extends StorageObject>(guildId: string, patch: Partial<T>): Promise<T> {
    const current = (await this.readGuildObject(guildId)) as T;
    const next = { ...current, ...patch };
    await this.writeGuildObject(guildId, next);
    return next;
  }

  async ensureGuild<T extends StorageObject>(guildId: string, defaults: T): Promise<T> {
    const current = (await this.readGuildObject(guildId)) as T;
    const next = { ...defaults, ...current };
    await this.writeGuildObject(guildId, next);
    return next;
  }

  private createKey(scope: "global" | "guild", key: string) {
    return `${this.namespace}:${scope}:${key}`;
  }

  private async readGuildObject(guildId: string): Promise<StorageObject> {
    return (
      (await this.keyv.get(this.createKey("guild", `${guildId}:__object__`))) ?? {}
    ) as StorageObject;
  }

  private async writeGuildObject(guildId: string, value: StorageObject): Promise<void> {
    await this.keyv.set(this.createKey("guild", `${guildId}:__object__`), value);
  }
}

export function createKeyvStorageAdapter(options?: KeyvStorageAdapterOptions) {
  return new KeyvStorageAdapter(options);
}

function createKeyvClient(url: string | undefined): Keyv<StorageValue> {
  if (!url) {
    return new Keyv<StorageValue>();
  }

  if (url.startsWith("sqlite:")) {
    const KeyvSqlite = require("@keyv/sqlite").default as new (options?: string) => unknown;
    return new Keyv<StorageValue>(new KeyvSqlite(url) as any);
  }

  if (url.startsWith("postgres:") || url.startsWith("postgresql:")) {
    const KeyvPostgres = require("@keyv/postgres").default as new (options?: string) => unknown;
    return new Keyv<StorageValue>(new KeyvPostgres(url) as any);
  }

  if (url.startsWith("mysql:")) {
    const KeyvMysql = require("@keyv/mysql").default as new (options?: string) => unknown;
    return new Keyv<StorageValue>(new KeyvMysql(url) as any);
  }

  if (url.startsWith("redis:")) {
    const KeyvRedis = require("@keyv/redis").default as new (options?: string) => unknown;
    return new Keyv<StorageValue>(new KeyvRedis(url) as any);
  }

  throw new Error(`Unsupported Keyv connection URL: ${url}`);
}
