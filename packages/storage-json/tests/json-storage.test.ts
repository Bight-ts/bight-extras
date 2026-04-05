import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runStorageAdapterContractSuite } from "../../../testing/storage-contract.js";
import { JsonStorageAdapter } from "../src/index.js";

let currentDir: string | undefined;

runStorageAdapterContractSuite("JsonStorageAdapter contract", {
  async createAdapter() {
    currentDir = await mkdtemp(join(tmpdir(), "bight-json-storage-contract-"));
    return new JsonStorageAdapter({
      filePath: join(currentDir, "config.json"),
    });
  },
  async cleanup() {
    if (currentDir) {
      await rm(currentDir, { recursive: true, force: true });
      currentDir = undefined;
    }
  },
});

describe("JsonStorageAdapter", () => {
  it("creates the file automatically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bight-json-storage-create-"));
    const filePath = join(dir, "config.json");

    const adapter = new JsonStorageAdapter({ filePath });
    await adapter.getGlobal("missing");

    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("\"global\"");

    await rm(dir, { recursive: true, force: true });
  });

  it("persists global and guild values to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bight-json-storage-"));
    const filePath = join(dir, "config.json");
    const adapter = new JsonStorageAdapter({ filePath });

    await adapter.setGlobal("count", 2);
    await adapter.patchGuild("guild-1", { prefix: "!" });

    expect(await adapter.getGlobal<number>("count")).toBe(2);
    expect(await adapter.getGuild<string>("guild-1", "prefix")).toBe("!");

    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("\"count\"");
    expect(raw).toContain("\"guild-1\"");

    const reloaded = new JsonStorageAdapter({ filePath });
    expect(await reloaded.getGlobal<number>("count")).toBe(2);
    expect(await reloaded.getGuild<string>("guild-1", "prefix")).toBe("!");

    await rm(dir, { recursive: true, force: true });
  });
});
