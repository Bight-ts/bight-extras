import { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
} from "@bight-ts/core";
import {
  createSchedulerPlugin,
  createStorageSchedulerStore,
  defineScheduledTask,
} from "../src/index.js";

describe("createSchedulerPlugin", () => {
  it("runs runOnStart tasks after login and schedules future executions", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const run = vi.fn();
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(() => 0 as unknown as NodeJS.Timeout);

    const plugin = createSchedulerPlugin({
      tasks: [
        defineScheduledTask({
          name: "heartbeat",
          intervalMs: 1_000,
          runOnStart: true,
          async run() {
            run();
          },
        }),
      ],
    });

    await plugin.afterLogin?.({
      client,
      registry,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      diagnostics: createMemoryDiagnosticsHub(),
      pluginNames: ["scheduler"],
      getEventCount: () => 0,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    setTimeoutSpy.mockRestore();
    client.destroy();
  });

  it("persists task state and recovers overdue runs once by default", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry<{ storage: ReturnType<typeof createMockStorage>; }>();
    let now = 1_000;
    const runFirst = vi.fn(async () => undefined);
    const runRecovered = vi.fn(async () => undefined);
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(() => 0 as unknown as NodeJS.Timeout);
    const storage = createMockStorage();
    const store = createStorageSchedulerStore({
      getStorage: () => storage,
    });
    const diagnostics = createMemoryDiagnosticsHub();

    const firstPlugin = createSchedulerPlugin({
      clock: () => now,
      tasks: [
        defineScheduledTask({
          name: "heartbeat",
          intervalMs: 1_000,
          runOnStart: true,
          async run() {
            await runFirst();
          },
        }),
      ],
      persistence: {
        store,
      },
    });

    await firstPlugin?.afterLogin?.({
      client,
      registry,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          storage,
        },
      },
      diagnostics,
      pluginNames: ["scheduler"],
      getEventCount: () => 0,
    });

    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(await store.get("heartbeat", {
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          storage,
        },
      },
    })).toMatchObject({
      taskName: "heartbeat",
      consecutiveFailures: 0,
      nextRunAt: new Date(2_000).toISOString(),
    });

    now = 2_500;

    const recoveredPlugin = createSchedulerPlugin({
      clock: () => now,
      tasks: [
        defineScheduledTask({
          name: "heartbeat",
          intervalMs: 1_000,
          runOnStart: true,
          async run() {
            await runRecovered();
          },
        }),
      ],
      persistence: {
        store,
      },
    });

    await recoveredPlugin?.afterLogin?.({
      client,
      registry,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          storage,
        },
      },
      diagnostics,
      pluginNames: ["scheduler"],
      getEventCount: () => 0,
    });

    expect(runRecovered).toHaveBeenCalledTimes(1);
    expect(diagnostics.recent().some((event) => event.type === "task_scheduled")).toBe(true);

    setTimeoutSpy.mockRestore();
    client.destroy();
  });
});

function createMockStorage() {
  const global = new Map<string, unknown>();

  return {
    adapter: {} as never,
    global: {
      async get<T>(key: string) {
        return global.get(key) as T | undefined;
      },
      async set<T>(key: string, value: T) {
        global.set(key, value);
      },
    },
    guilds: {} as never,
  };
}
