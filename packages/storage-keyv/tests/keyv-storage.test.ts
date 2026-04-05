import Keyv from "keyv";
import { describe, expect, it } from "vitest";
import { runStorageAdapterContractSuite } from "../../../testing/storage-contract.js";
import { KeyvStorageAdapter } from "../src/index.js";

runStorageAdapterContractSuite("KeyvStorageAdapter contract", {
  createAdapter() {
    return new KeyvStorageAdapter({
      keyv: new Keyv(),
    });
  },
});

describe("KeyvStorageAdapter", () => {
  it("keeps namespaces isolated", async () => {
    const keyv = new Keyv();
    const left = new KeyvStorageAdapter({
      keyv,
      namespace: "left",
    });
    const right = new KeyvStorageAdapter({
      keyv,
      namespace: "right",
    });

    await left.setGlobal("count", 1);
    await right.setGlobal("count", 2);

    expect(await left.getGlobal<number>("count")).toBe(1);
    expect(await right.getGlobal<number>("count")).toBe(2);
  });
});
