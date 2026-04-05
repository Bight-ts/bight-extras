import { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
  definePrecondition,
} from "@bight-ts/core";
import {
  createMessageCommandsPlugin,
  defineMessageCommand,
} from "../src/index.js";

function createMessage(content: string) {
  return {
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

describe("createMessageCommandsPlugin", () => {
  it("returns null when disabled", () => {
    expect(createMessageCommandsPlugin({ enabled: false, commands: [] })).toBeNull();
  });

  it("runs the first matching command", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const executed = vi.fn(async () => undefined);
    const plugin = createMessageCommandsPlugin({
      commands: [
        defineMessageCommand({
          data: { name: "hello" },
          match: ({ message }) => message.content === "hello bight",
          execute: executed,
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["message-commands"],
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
    expect(event?.name).toBe("messageCreate");

    const message = createMessage("hello bight");
    await event.execute({
      args: [message],
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(executed).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  it("uses shared denial flow and diagnostics", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const onDenied = vi.fn(async ({ reply }) => {
      await reply("Blocked.");
    });

    registry.preconditions.set(
      "guild-locked",
      definePrecondition({
        name: "guild-locked",
        check() {
          return "Nope.";
        },
      }),
    );

    const plugin = createMessageCommandsPlugin({
      commands: [
        defineMessageCommand({
          data: { name: "hello" },
          preconditions: ["guild-locked"],
          onDenied,
          match: () => true,
          async execute() { },
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["message-commands"],
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
    const message = createMessage("hello bight");
    await event.execute({
      args: [message],
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(message.reply).toHaveBeenCalledWith("Blocked.");
    expect(diagnostics.recent(1)[0]).toMatchObject({
      type: "command_denied",
      kind: "message-command",
      commandName: "hello",
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
      kinds: ["message-command"],
    });

    const plugin = createMessageCommandsPlugin({
      commands: [
        defineMessageCommand({
          data: { name: "hello" },
          match: () => true,
          async execute() { },
        }),
      ],
    });

    const addEvent = vi.fn();
    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["message-commands"],
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
    const message = createMessage("hello bight");
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
