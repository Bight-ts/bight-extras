import {
  createLogger,
  defineCommand,
  definePlugin,
  defineSubcommand,
  type BotCommand,
  type BightDiagnosticEvent,
  type BightDiagnosticsSnapshot,
  type BightOfficialPluginOptions,
  type BightPluginLifecycle,
  type BightPluginSetup,
  type BightServiceMap,
  type CommandExecution,
  type MaybeBightPlugin,
} from "@bight-ts/core";
import { formatJsonCodeBlock, truncateText } from "@bight-ts/toolkit";
import { MessageFlags, SlashCommandBuilder } from "discord.js";

const MAX_REPLY_LENGTH = 1_900;

interface DevtoolsStatus {
  bot: string;
  environment: string;
  commands: number;
  preconditions: number;
  globalPreconditions: number;
  buttonHandlers: number;
  modalHandlers: number;
  selectMenuHandlers: number;
  events: number;
  plugins: string[];
}

export interface DevtoolsPluginOptions extends BightOfficialPluginOptions {
  commandName?: string;
  recentEventLimit?: number;
  logStartupSnapshot?: boolean;
  includeCommand?: boolean;
  devOnly?: boolean;
  preconditions?: string[];
}

export function createDevtoolsPlugin<TServices extends BightServiceMap>(
  options: DevtoolsPluginOptions = {},
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "devtools";
  const logger = createLogger(options.loggerScope ?? "devtools");
  const commandName = options.commandName ?? "bight-devtools";
  const recentEventLimit = options.recentEventLimit ?? 10;
  const includeCommand = options.includeCommand ?? true;
  const devOnly = options.devOnly ?? true;
  const logStartupSnapshot =
    options.logStartupSnapshot ?? process.env.NODE_ENV === "development";

  return definePlugin({
    name: pluginName,
    setup(input: BightPluginSetup<TServices>) {
      if (!includeCommand) {
        return;
      }

      input.addCommand(
        createDevtoolsCommand({
          commandName,
          devOnly,
          preconditions: options.preconditions,
          recentEventLimit,
          getStatus: () => ({
            bot: input.client.user?.tag ?? "not ready",
            environment: process.env.NODE_ENV ?? "unknown",
            commands: input.registry.commands.size,
            preconditions: input.registry.preconditions.size,
            globalPreconditions: input.registry.globalPreconditions.length,
            buttonHandlers:
              input.registry.buttonHandlersExact.size
              + input.registry.buttonHandlersPrefix.size,
            modalHandlers:
              input.registry.modalHandlersExact.size
              + input.registry.modalHandlersPrefix.size,
            selectMenuHandlers:
              input.registry.selectMenuHandlersExact.size
              + input.registry.selectMenuHandlersPrefix.size,
            events: input.getEventCount(),
            plugins: input.pluginNames,
          }),
          getEvents: () => input.diagnostics.recent(recentEventLimit),
          getReports: async () =>
            input.diagnostics.createSnapshot({
              client: input.client,
              context: input.context,
              registry: input.registry,
              pluginNames: input.pluginNames,
              eventCount: input.getEventCount(),
            }),
        }),
      );
    },
    async afterLogin(input: BightPluginLifecycle<TServices>) {
      if (!logStartupSnapshot) {
        return;
      }

      const snapshot = await input.diagnostics.createSnapshot({
        client: input.client,
        context: input.context,
        registry: input.registry,
        pluginNames: input.pluginNames,
        eventCount: input.getEventCount(),
      });

      logger.info("Bight devtools startup snapshot", snapshot);
    },
  });
}

function createDevtoolsCommand<TServices extends BightServiceMap>(options: {
  commandName: string;
  devOnly: boolean;
  preconditions?: string[];
  recentEventLimit: number;
  getStatus: () => DevtoolsStatus;
  getEvents: () => BightDiagnosticEvent[];
  getReports: () => Promise<BightDiagnosticsSnapshot>;
}): BotCommand<TServices> {
  return defineCommand({
    data: new SlashCommandBuilder()
      .setName(options.commandName)
      .setDescription("Inspect the current Bight runtime."),
    devOnly: options.devOnly,
    preconditions: options.preconditions,
    subcommands: [
      defineSubcommand({
        name: "status",
        description: "Show the current runtime summary.",
        async execute({ interaction }: CommandExecution<TServices>) {
          const status = options.getStatus();
          await interaction.reply({
            content: truncateMessage(
              [
                "Bight runtime status",
                "",
                formatKeyValue("bot", status.bot),
                formatKeyValue("environment", status.environment),
                formatKeyValue("commands", status.commands),
                formatKeyValue("preconditions", status.preconditions),
                formatKeyValue("global preconditions", status.globalPreconditions),
                formatKeyValue("button handlers", status.buttonHandlers),
                formatKeyValue("modal handlers", status.modalHandlers),
                formatKeyValue("select menu handlers", status.selectMenuHandlers),
                formatKeyValue("events", status.events),
                formatKeyValue(
                  "plugins",
                  status.plugins.join(", "),
                ),
              ].join("\n"),
            ),
            flags: MessageFlags.Ephemeral,
          });
        },
      }),
      defineSubcommand({
        name: "events",
        description: "Show recent diagnostics events.",
        async execute({ interaction }: CommandExecution<TServices>) {
          const events = options.getEvents();
          const lines = events.length > 0
            ? events.map(formatEvent)
            : [`No diagnostics events recorded yet. Limit: ${options.recentEventLimit}`];

          await interaction.reply({
            content: truncateMessage(
              [
                `Recent Bight diagnostics events (${Math.min(events.length, options.recentEventLimit)})`,
                "",
                ...lines,
              ].join("\n"),
            ),
            flags: MessageFlags.Ephemeral,
          });
        },
      }),
      defineSubcommand({
        name: "reports",
        description: "Show structured diagnostics reports.",
        async execute({ interaction }: CommandExecution<TServices>) {
          const reports = await options.getReports();
          await interaction.reply({
            content: formatJsonReply("Bight diagnostics reports", reports),
            flags: MessageFlags.Ephemeral,
          });
        },
      }),
    ],
  });
}

function formatKeyValue(label: string, value: unknown) {
  if (Array.isArray(value)) {
    return `${label}: ${value.join(", ")}`;
  }

  return `${label}: ${String(value)}`;
}

function formatEvent(event: BightDiagnosticEvent) {
  switch (event.type) {
    case "command_denied":
      return `[${event.timestamp}] command_denied command=${event.commandName} code=${event.code} message=${event.message}`;
    case "command_error":
      return `[${event.timestamp}] command_error command=${event.commandName} kind=${event.kind} message=${event.message}`;
    case "interaction_error":
      return `[${event.timestamp}] interaction_error kind=${event.kind} customId=${event.customId} message=${event.message}`;
    case "plugin_loaded":
    case "plugin_before_login":
    case "plugin_after_login":
      return `[${event.timestamp}] ${event.type} plugin=${event.pluginName}`;
    case "task_scheduled":
      return `[${event.timestamp}] task_scheduled task=${event.taskName} nextRunAt=${event.nextRunAt}`;
    case "task_started":
      return `[${event.timestamp}] task_started task=${event.taskName}`;
    case "task_succeeded":
      return `[${event.timestamp}] task_succeeded task=${event.taskName} finishedAt=${event.finishedAt}`;
    case "task_failed":
      return `[${event.timestamp}] task_failed task=${event.taskName} message=${event.message}`;
    default: {
      return JSON.stringify(event);
    }
  }
}

function formatJsonReply(title: string, value: unknown) {
  return truncateText(
    `${title}\n${formatJsonCodeBlock(value, {
      limit: MAX_REPLY_LENGTH - title.length - 1,
    })}`,
    {
      limit: MAX_REPLY_LENGTH,
    },
  );
}

function truncateMessage(content: string) {
  return truncateText(content, {
    limit: MAX_REPLY_LENGTH,
    suffix: "\n...(truncated)",
  });
}
