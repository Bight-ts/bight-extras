import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { runStorageAdapterContractSuite } from "../../../testing/storage-contract.js";
import { createPrismaStorageAdapter } from "../src/index.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let currentClient: PrismaClient | undefined;
let currentDir: string | undefined;

runStorageAdapterContractSuite("PrismaStorageAdapter contract", {
  async createAdapter() {
    currentDir = await mkdtemp(join(tmpdir(), "bight-prisma-storage-"));
    const databasePath = join(currentDir, "storage.db");
    const databaseUrl = `file:${databasePath}`;

    execFileSync(
      "pnpm",
      ["exec", "prisma", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"],
      {
        cwd: packageDir,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        stdio: "ignore",
      },
    );

    currentClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    return createPrismaStorageAdapter({
      globalConfigs: currentClient.globalConfig,
      guildConfigs: currentClient.guildConfig,
    });
  },
  async cleanup() {
    await currentClient?.$disconnect();
    currentClient = undefined;

    if (currentDir) {
      await rm(currentDir, { recursive: true, force: true });
      currentDir = undefined;
    }
  },
});
