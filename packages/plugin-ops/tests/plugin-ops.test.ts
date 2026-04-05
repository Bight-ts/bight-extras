import { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
} from "@bight-ts/core";
import {
  createEnvStartupCheck,
  createErrorReporterPlugin,
  createMaintenanceModePlugin,
  createServicesStartupCheck,
  createStartupChecksPlugin,
} from "../src/index.js";

describe("@bight-ts/plugin-ops", () => {
  it("runs startup checks and exposes diagnostics state", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry<{ storage: { ok: true; }; }>();
    const diagnostics = createMemoryDiagnosticsHub<{ storage: { ok: true; }; }>();
    const plugin = createStartupChecksPlugin({
      mode: "warn",
      requiredEnv: ["BIGHT_TEST_REQUIRED_ENV"],
      requiredServices: [
        {
          name: "storage",
          get: (context) => context.services.storage,
        },
      ],
    });

    delete process.env.BIGHT_TEST_REQUIRED_ENV;

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["startup-checks"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          storage: { ok: true },
        },
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    await expect(
      plugin?.beforeLogin?.({
        client,
        registry,
        diagnostics,
        pluginNames: ["startup-checks"],
        getEventCount: () => 0,
        context: {
          client,
          logger: createLogger("test", { level: "debug" }),
          services: {
            storage: { ok: true },
          },
        },
      }),
    ).resolves.toBeUndefined();

    const snapshot = await diagnostics.createSnapshot({
      client,
      registry,
      pluginNames: ["startup-checks"],
      eventCount: 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          storage: { ok: true },
        },
      },
    });

    expect(snapshot.sources["startup-checks"]).toMatchObject({
      mode: "warn",
      lastPhase: "before-login",
    });
    client.destroy();
  });

  it("fails startup checks in fail mode", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const plugin = createStartupChecksPlugin({
      mode: "fail",
      checks: [createEnvStartupCheck(["BIGHT_MISSING_ENV"])],
    });

    delete process.env.BIGHT_MISSING_ENV;

    await expect(
      plugin?.beforeLogin?.({
        client,
        registry,
        diagnostics,
        pluginNames: ["startup-checks"],
        getEventCount: () => 0,
        context: {
          client,
          logger: createLogger("test", { level: "debug" }),
          services: {},
        },
      }),
    ).rejects.toThrow("Startup checks failed");
    client.destroy();
  });

  it("registers a global maintenance precondition and optional command", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    let state = {
      enabled: true,
      message: "Down for maintenance.",
      allowUsers: ["owner-1"],
      allowGuilds: [],
      allowCommands: ["safe"],
    };
    const addCommand = vi.fn((command) => {
      registry.commands.set(command.data.name, command);
    });
    const addPrecondition = vi.fn((precondition) => {
      registry.preconditions.set(precondition.name, precondition);
    });
    const addGlobalPrecondition = vi.fn((precondition) => {
      registry.globalPreconditions.push(precondition);
    });
    const plugin = createMaintenanceModePlugin({
      getState: () => state,
      setState: async (_context, next) => {
        state = next;
      },
      includeCommand: true,
    });

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["maintenance-mode"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand,
      addPrecondition,
      addGlobalPrecondition,
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    expect(addGlobalPrecondition).toHaveBeenCalledWith({
      name: "maintenance-mode",
      kinds: expect.any(Array),
    });
    expect(registry.commands.has("maintenance")).toBe(true);

    const precondition = registry.preconditions.get("maintenance-mode");
    await expect(
      precondition?.check({
        kind: "command",
        subject: {
          commandName: "safe",
          user: { id: "user-1" },
          guildId: "guild-1",
          isChatInputCommand: () => true,
        } as never,
        interaction: {
          commandName: "safe",
          user: { id: "user-1" },
          guildId: "guild-1",
        } as never,
        context: {
          client,
          logger: createLogger("test", { level: "debug" }),
          services: {},
        },
      }),
    ).resolves.toBe(true);

    await expect(
      precondition?.check({
        kind: "command",
        subject: {
          commandName: "blocked",
          user: { id: "user-2" },
          guildId: "guild-2",
          isChatInputCommand: () => true,
        } as never,
        interaction: {
          commandName: "blocked",
          user: { id: "user-2" },
          guildId: "guild-2",
        } as never,
        context: {
          client,
          logger: createLogger("test", { level: "debug" }),
          services: {},
        },
      }),
    ).resolves.toBe("Down for maintenance.");

    client.destroy();
  });

  it("delivers selected diagnostics events to an error reporter", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry<{ reporter: { capture: ReturnType<typeof vi.fn>; }; }>();
    const diagnostics = createMemoryDiagnosticsHub<{ reporter: { capture: ReturnType<typeof vi.fn>; }; }>();
    const capture = vi.fn(async () => undefined);
    const plugin = createErrorReporterPlugin({
      getReporter: (context) => context.services.reporter,
      redact(event) {
        if (event.type === "command_denied") {
          return null;
        }

        return event;
      },
    });

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["error-reporter"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          reporter: {
            capture,
          },
        },
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    diagnostics.record({
      type: "command_denied",
      timestamp: new Date().toISOString(),
      kind: "command",
      commandName: "ping",
      guildId: "guild-1",
      userId: "user-1",
      code: "precondition_failed",
      message: "blocked",
    });
    diagnostics.record({
      type: "command_error",
      timestamp: new Date().toISOString(),
      kind: "command",
      commandName: "ping",
      guildId: "guild-1",
      userId: "user-1",
      message: "boom",
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: "command_error",
      }),
      pluginName: "error-reporter",
    });
    client.destroy();
  });

  it("builds service checks from getters", async () => {
    const check = createServicesStartupCheck([
      {
        name: "storage",
        get: (context: { services: { storage?: unknown; }; }) => context.services.storage,
      },
    ]);

    const outcome = await check.run({
      client: {} as never,
      registry: createBightRegistry(),
      diagnostics: createMemoryDiagnosticsHub(),
      pluginNames: [],
      getEventCount: () => 0,
      context: {
        client: {} as never,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(outcome).toMatchObject({
      status: "fail",
    });
  });
});
