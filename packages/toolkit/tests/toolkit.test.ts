import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MemoryCache,
  clampPageIndex,
  createConfirmationRow,
  createKeyedLock,
  createPagerRow,
  discordTimestamp,
  formatJsonCodeBlock,
  formatSafeParseIssues,
  formatZodIssues,
  paginateItems,
  parseOption,
  relativeTime,
  safeParseOption,
  splitText,
  truncateCodeBlock,
  truncateText,
} from "../src/index.js";

describe("@bight-ts/toolkit", () => {
  it("expires cached values and supports remember()", async () => {
    let now = 0;
    const cache = new MemoryCache<number>({
      now: () => now,
    });

    cache.set("count", 1, 100);
    expect(cache.get("count")).toBe(1);
    expect(cache.has("count")).toBe(true);

    now = 150;
    expect(cache.get("count")).toBeUndefined();
    expect(cache.has("count")).toBe(false);

    const value = await cache.remember("count", 100, async () => 2);
    expect(value).toBe(2);
    expect(cache.get("count")).toBe(2);
  });

  it("dedupes inflight cache factories and avoids caching failures", async () => {
    const cache = new MemoryCache<number>();
    let calls = 0;

    const [first, second] = await Promise.all([
      cache.rememberInflight("count", 100, async () => {
        calls += 1;
        await Promise.resolve();
        return 42;
      }),
      cache.rememberInflight("count", 100, async () => {
        calls += 1;
        return 100;
      }),
    ]);

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(calls).toBe(1);

    await expect(
      cache.rememberInflight("broken", 100, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(
      cache.rememberInflight("broken", 100, async () => {
        throw new Error("boom again");
      }),
    ).rejects.toThrow("boom again");
  });

  it("serializes same-key locks and allows different keys in parallel", async () => {
    const lock = createKeyedLock();
    const order: string[] = [];

    const first = lock.run("guild-1", async () => {
      order.push("first:start");
      expect(lock.isLocked("guild-1")).toBe(true);
      await Promise.resolve();
      order.push("first:end");
    });

    const second = lock.run("guild-1", async () => {
      order.push("second:start");
      order.push("second:end");
    });

    const other = lock.run("guild-2", async () => {
      order.push("other:start");
      order.push("other:end");
    });

    await Promise.all([first, second, other]);

    expect(order.indexOf("second:start")).toBeGreaterThan(order.indexOf("first:end"));
    expect(order.indexOf("other:start")).toBeGreaterThan(-1);
    expect(lock.isLocked("guild-1")).toBe(false);
  });

  it("parses values with zod schemas and formats validation issues", () => {
    expect(parseOption(z.string().min(2), "ok")).toBe("ok");

    const result = safeParseOption(
      z.object({
        prefix: z.string().min(2),
        nested: z.object({
          enabled: z.boolean(),
        }),
      }),
      {
        prefix: "!",
        nested: {
          enabled: "nope",
        },
      },
    );

    expect(result.success).toBe(false);
    expect(formatSafeParseIssues(result, { prefix: "Validation failed" })).toContain(
      "Validation failed",
    );

    if (!result.success) {
      expect(formatZodIssues(result.error)).toContain("prefix");
      expect(formatZodIssues(result.error)).toContain("nested.enabled");
    }
  });

  it("formats and splits text for Discord-safe output", () => {
    const chunks = splitText("one\ntwo\nthree", { limit: 7 });

    expect(truncateText("abcdef", { limit: 5 })).toBe("ab...");
    expect(chunks.every((chunk) => chunk.length <= 7)).toBe(true);
    expect(chunks.join("\n")).toBe("one\ntwo\nthree");
    expect(truncateCodeBlock("const x = 1;", { limit: 20, language: "ts" })).toContain(
      "```ts",
    );
    expect(formatJsonCodeBlock({ ok: true }, { limit: 40 })).toContain("```json");
  });

  it("creates stateless interaction rows and pagination helpers", () => {
    const confirmationRow = createConfirmationRow({
      confirmCustomId: "confirm",
      cancelCustomId: "cancel",
      confirmStyle: ButtonStyle.Primary,
    });
    const pagerRow = createPagerRow({
      previousCustomId: "prev",
      nextCustomId: "next",
      disableNext: true,
    });

    expect(confirmationRow.components).toHaveLength(2);
    expect(confirmationRow.components[0]?.toJSON()).toMatchObject({
      custom_id: "confirm",
      style: ButtonStyle.Primary,
    });
    expect(pagerRow.components[1]?.toJSON()).toMatchObject({
      custom_id: "next",
      disabled: true,
    });
    expect(paginateItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(clampPageIndex(10, 3)).toBe(2);
    expect(clampPageIndex(-1, 3)).toBe(0);
  });

  it("formats Discord timestamps from seconds, milliseconds, and dates", () => {
    expect(relativeTime(0)).toBe("<t:0:R>");
    expect(relativeTime(1_700_000_000_000)).toBe("<t:1700000000:R>");
    expect(discordTimestamp(new Date(0))).toBe("<t:0:t>");
  });
});
