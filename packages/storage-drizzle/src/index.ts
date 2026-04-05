import {
  mysqlTable,
  text as mysqlText,
  varchar as mysqlVarchar,
} from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";
import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";
import type { StorageAdapter, StorageObject, StorageValue } from "@bight-ts/core";

type DrizzleTableLike = Record<string, unknown>;

type DrizzleStorageTables<TGlobalTable, TGuildTable> = {
  globalConfigs: TGlobalTable;
  guildConfigs: TGuildTable;
};

type InsertBuilderLike = {
  onConflictDoUpdate?: (input: { target: unknown; set: Record<string, unknown>; }) => Promise<unknown>;
  onDuplicateKeyUpdate?: (input: { set: Record<string, unknown>; }) => Promise<unknown>;
};

type DrizzleDatabaseLike = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (value: number) => Promise<Array<Record<string, unknown>>>;
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => InsertBuilderLike;
  };
};

export interface DrizzleStorageAdapterOptions<TDatabase, TGlobalTable, TGuildTable> {
  db: TDatabase;
  tables: DrizzleStorageTables<TGlobalTable, TGuildTable>;
  serialize?: (value: StorageValue) => string;
  deserialize?: (value: string) => StorageValue;
}

export function createDrizzleStorageAdapter<TDatabase, TGlobalTable, TGuildTable>(
  options: DrizzleStorageAdapterOptions<TDatabase, TGlobalTable, TGuildTable>,
): StorageAdapter {
  return new DrizzleStorageAdapter(options);
}

export function createSqliteStorageTables(namePrefix?: string) {
  return {
    globalConfigs: sqliteTable(tableName(namePrefix, "global_configs"), {
      key: sqliteText("key").primaryKey(),
      value: sqliteText("value").notNull(),
    }),
    guildConfigs: sqliteTable(tableName(namePrefix, "guild_configs"), {
      guildId: sqliteText("guild_id").primaryKey(),
      value: sqliteText("value").notNull(),
    }),
  };
}

export function createPostgresStorageTables(namePrefix?: string) {
  return {
    globalConfigs: pgTable(tableName(namePrefix, "global_configs"), {
      key: pgText("key").primaryKey(),
      value: pgText("value").notNull(),
    }),
    guildConfigs: pgTable(tableName(namePrefix, "guild_configs"), {
      guildId: pgText("guild_id").primaryKey(),
      value: pgText("value").notNull(),
    }),
  };
}

export function createMysqlStorageTables(namePrefix?: string) {
  return {
    globalConfigs: mysqlTable(tableName(namePrefix, "global_configs"), {
      key: mysqlVarchar("key", { length: 191 }).primaryKey(),
      value: mysqlText("value").notNull(),
    }),
    guildConfigs: mysqlTable(tableName(namePrefix, "guild_configs"), {
      guildId: mysqlVarchar("guild_id", { length: 191 }).primaryKey(),
      value: mysqlText("value").notNull(),
    }),
  };
}

class DrizzleStorageAdapter<TDatabase, TGlobalTable, TGuildTable> implements StorageAdapter {
  private readonly db: DrizzleDatabaseLike;
  private readonly tables: DrizzleStorageTables<TGlobalTable, TGuildTable>;
  private readonly serialize: (value: StorageValue) => string;
  private readonly deserialize: (value: string) => StorageValue;

  constructor(options: DrizzleStorageAdapterOptions<TDatabase, TGlobalTable, TGuildTable>) {
    this.db = options.db as DrizzleDatabaseLike;
    this.tables = options.tables;
    this.serialize = options.serialize ?? JSON.stringify;
    this.deserialize = options.deserialize ?? ((value) => JSON.parse(value) as StorageValue);
  }

  async getGlobal<T extends StorageValue>(key: string): Promise<T | undefined> {
    const result = await this.db
      .select()
      .from(this.tables.globalConfigs)
      .where(eq((this.tables.globalConfigs as DrizzleTableLike).key as never, key))
      .limit(1);
    const raw = result[0]?.value;
    return raw ? (this.deserialize(String(raw)) as T) : undefined;
  }

  async setGlobal<T extends StorageValue>(key: string, value: T): Promise<void> {
    await this.upsert(
      this.tables.globalConfigs,
      { key, value: this.serialize(value) },
      (this.tables.globalConfigs as DrizzleTableLike).key,
    );
  }

  async getGuild<T extends StorageValue>(guildId: string, key: string): Promise<T | undefined> {
    const result = await this.db
      .select()
      .from(this.tables.guildConfigs)
      .where(eq((this.tables.guildConfigs as DrizzleTableLike).guildId as never, guildId))
      .limit(1);
    const raw = result[0]?.value;
    const payload = raw ? (this.deserialize(String(raw)) as StorageObject) : undefined;
    return payload?.[key] as T | undefined;
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
    const result = await this.db
      .select()
      .from(this.tables.guildConfigs)
      .where(eq((this.tables.guildConfigs as DrizzleTableLike).guildId as never, guildId))
      .limit(1);

    if (!result[0]?.value) {
      await this.writeGuild(guildId, defaults);
      return defaults;
    }

    const next = {
      ...defaults,
      ...(this.deserialize(String(result[0].value)) as T),
    };

    await this.writeGuild(guildId, next);
    return next;
  }

  private async writeGuild(guildId: string, value: StorageObject) {
    await this.upsert(
      this.tables.guildConfigs,
      { guildId, value: this.serialize(value) },
      (this.tables.guildConfigs as DrizzleTableLike).guildId,
    );
  }

  private async upsert(
    table: unknown,
    values: Record<string, unknown>,
    target: unknown,
  ) {
    const builder = this.db.insert(table).values(values);

    if (typeof builder.onConflictDoUpdate === "function") {
      await builder.onConflictDoUpdate({
        target,
        set: {
          value: values.value,
        },
      });
      return;
    }

    if (typeof builder.onDuplicateKeyUpdate === "function") {
      await builder.onDuplicateKeyUpdate({
        set: {
          value: values.value,
        },
      });
      return;
    }

    throw new Error("The provided Drizzle database does not support upsert operations.");
  }
}

function tableName(namePrefix: string | undefined, name: string) {
  return namePrefix ? `${namePrefix}_${name}` : name;
}
