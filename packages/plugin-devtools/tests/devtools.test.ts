import { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
} from "@bight-ts/core";
import { createDevtoolsPlugin } from "../src/index.js";

describe("createDevtoolsPlugin", () => {
  it("returns null when disabled", () => {
    expect(createDevtoolsPlugin({ enabled: false })).toBeNull();
  });

  it("registers a grouped command during setup", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    const plugin = createDevtoolsPlugin();

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["devtools"],
      getEventCount: () => 2,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand(command) {
        registry.commands.set(command.data.name, command);
      },
      addPrecondition(precondition) {
        registry.preconditions.set(precondition.name, precondition);
      },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    const command = registry.commands.get("bight-devtools");
    expect(command).toBeDefined();
    expect(command?.devOnly).toBe(true);
    expect("subcommands" in (command ?? {})).toBe(true);

    client.destroy();
  });

  it("surfaces recent events and reports through the registered command", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry();
    const diagnostics = createMemoryDiagnosticsHub();
    diagnostics.registerSource({
      name: "extra",
      snapshot() {
        return { ok: true };
      },
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

    const plugin = createDevtoolsPlugin({
      recentEventLimit: 5,
    });

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["devtools"],
      getEventCount: () => 1,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
      addCommand(command) {
        registry.commands.set(command.data.name, command);
      },
      addPrecondition(precondition) {
        registry.preconditions.set(precondition.name, precondition);
      },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    const command = registry.commands.get("bight-devtools");
    expect(command).toBeDefined();
    expect(command && "subcommands" in command).toBe(true);

    const reply = vi.fn(async () => undefined);
    const interaction = {
      reply,
      client,
    } as never;

    const subcommands = "subcommands" in (command ?? {}) ? command?.subcommands ?? [] : [];
    const events = subcommands.find((entry) => entry.name === "events");
    const reports = subcommands.find((entry) => entry.name === "reports");

    await events?.execute({
      interaction,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("command_error"),
      }),
    );

    await reports?.execute({
      interaction,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {},
      },
    });

    expect(reply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("\"extra\""),
      }),
    );

    client.destroy();
  });
});
