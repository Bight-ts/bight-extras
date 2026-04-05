import { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
  definePrecondition,
} from "@bight-ts/core";
import {
  createPrefixCommandsPlugin,
  definePrefixCommand,
} from "../src/index.js";

function createMessage(content: string, client: Client) {
  return {
    client,
    content,
    guildId: "guild-1",
    author: {
      id: "user-1",
      bot: false,
    },
    inGuild: () => true,
    reply: vi.fn(async () => undefined),
  };
}

describe("createPrefixCommandsPlugin", () => {
  it("runs a matched prefix command", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const executed = vi.fn(async () => undefined);
    const plugin = createPrefixCommandsPlugin({
      getPrefixes: () => ["!"],
      commands: [
        definePrefixCommand({
          data: { name: "ping", aliases: ["p"] },
          execute: executed,
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["prefix-commands"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent,
    });

    const event = addEvent.mock.calls[0]?.[0];
    const message = createMessage("!ping one two", client);
    await event.execute({
      args: [message],
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(executed).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "!",
        commandName: "ping",
        args: ["one", "two"],
        rawArgs: "one two",
      }),
    );
    client.destroy();
  });

  it("supports denied execution and diagnostics", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const onDenied = vi.fn(async ({ reply }) => {
      await reply("Blocked prefix.");
    });

    registry.preconditions.set(
      "never",
      definePrecondition({
        name: "never",
        check() {
          return false;
        },
      }),
    );

    const plugin = createPrefixCommandsPlugin({
      getPrefixes: () => ["!"],
      commands: [
        definePrefixCommand({
          data: { name: "ping" },
          preconditions: ["never"],
          onDenied,
          async execute() { },
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["prefix-commands"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent,
    });

    const event = addEvent.mock.calls[0]?.[0];
    const message = createMessage("!ping", client);
    await event.execute({
      args: [message],
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(message.reply).toHaveBeenCalledWith("Blocked prefix.");
    expect(diagnostics.recent(1)[0]).toMatchObject({
      type: "command_denied",
      kind: "prefix-command",
      commandName: "ping",
    });
    client.destroy();
  });

  it("respects global preconditions from the shared runtime registry", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();

    registry.preconditions.set(
      "maintenance",
      definePrecondition({
        name: "maintenance",
        check() {
          return "Maintenance.";
        },
      }),
    );
    registry.globalPreconditions.push({
      name: "maintenance",
      kinds: ["prefix-command"],
    });

    const plugin = createPrefixCommandsPlugin({
      getPrefixes: () => ["!"],
      commands: [
        definePrefixCommand({
          data: { name: "ping" },
          async execute() { },
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["prefix-commands"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent,
    });

    const event = addEvent.mock.calls[0]?.[0];
    const message = createMessage("!ping", client);
    await event.execute({
      args: [message],
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(message.reply).toHaveBeenCalledWith("Maintenance.");
    client.destroy();
  });
});
