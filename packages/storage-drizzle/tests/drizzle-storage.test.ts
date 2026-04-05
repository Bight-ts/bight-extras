import initSqlJs, { type Database } from "sql.js";
import { drizzle as drizzleSqlJs } from "drizzle-orm/sql-js";
import { describe, expect, it } from "vitest";
import { runStorageAdapterContractSuite } from "../../../testing/storage-contract.js";
import {
  createDrizzleStorageAdapter,
  createSqliteStorageTables,
} from "../src/index.js";

let database: Database | undefined;

runStorageAdapterContractSuite("DrizzleStorageAdapter contract", {
  async createAdapter() {
    const SQL = await initSqlJs();
    database = new SQL.Database();
    database.run(`
      CREATE TABLE global_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE guild_configs (
        guild_id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const db = drizzleSqlJs(database);
    const tables = createSqliteStorageTables();

    return createDrizzleStorageAdapter({
      db,
      tables,
    });
  },
  cleanup() {
    database?.close();
    database = undefined;
  },
});

describe("createDrizzleStorageAdapter", () => {
  it("supports serializer overrides", async () => {
    const SQL = await initSqlJs();
    const rawDatabase = new SQL.Database();
    rawDatabase.run(`
      CREATE TABLE global_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE guild_configs (
        guild_id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const db = drizzleSqlJs(rawDatabase);
    const tables = createSqliteStorageTables();
    const adapter = createDrizzleStorageAdapter({
      db,
      tables,
      serialize: (value) => `wrapped:${JSON.stringify(value)}`,
      deserialize: (value) => JSON.parse(value.replace(/^wrapped:/, "")),
    });

    await adapter.setGlobal("count", 3);

    const queryResult = rawDatabase.exec("select value from global_configs where key = 'count'");
    const stored = queryResult[0]?.values[0]?.[0];

    expect(stored).toBe("wrapped:3");
    expect(await adapter.getGlobal<number>("count")).toBe(3);

    rawDatabase.close();
  });
});
