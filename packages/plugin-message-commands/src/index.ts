import {
  createLogger,
  createMemoryCooldownStore,
  definePlugin,
  enforceNamedCooldown,
  evaluateExecutionAccess,
  handleDeniedExecution,
  type BightContext,
  type BightDeniedHandler,
  type BightOfficialPluginOptions,
  type BightServiceMap,
  type CooldownOptions,
  type CooldownStore,
  type MaybeBightPlugin,
} from "@bight-ts/core";
import type { Message } from "discord.js";

export interface MessageCommandData {
  name: string;
  description?: string;
}

export interface MessageCommandExecution<TServices extends BightServiceMap> {
  message: Message<boolean>;
  context: BightContext<TServices>;
}

export interface MessageCommand<TServices extends BightServiceMap = Record<string, never>> {
  data: MessageCommandData;
  cooldown?: number;
  devOnly?: boolean;
  preconditions?: string[];
  onDenied?: BightDeniedHandler<TServices, Message<boolean>>;
  match: (
    input: MessageCommandExecution<TServices>,
  ) => Promise<boolean> | boolean;
  execute: (
    input: MessageCommandExecution<TServices>,
  ) => Promise<void> | void;
}

export interface MessageCommandsPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  commands: MessageCommand<TServices>[];
  ignoreBots?: boolean;
  ignoreSelf?: boolean;
  cooldowns?: Partial<Omit<CooldownOptions, "store">> & { store?: CooldownStore; };
}

export const defineMessageCommand = <
  TServices extends BightServiceMap = Record<string, never>,
>(
  command: MessageCommand<TServices>,
) => command;

export function createMessageCommandsPlugin<TServices extends BightServiceMap>(
  options: MessageCommandsPluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "message-commands";
  const logger = createLogger(options.loggerScope ?? "message-commands");
  const ignoreBots = options.ignoreBots ?? true;
  const ignoreSelf = options.ignoreSelf ?? true;
  const cooldowns: CooldownOptions = {
    enabled: options.cooldowns?.enabled ?? true,
    defaultSeconds: options.cooldowns?.defaultSeconds ?? 3,
    store: options.cooldowns?.store ?? createMemoryCooldownStore(),
  };
  const environment = {
    isDevelopment: process.env.NODE_ENV === "development",
  };

  return definePlugin({
    name: pluginName,
    setup(input) {
      input.addEvent({
        name: "messageCreate",
        async execute({ args, context }) {
          const message = args[0] as Message<boolean> | undefined;
          if (!message) {
            return;
          }

          if (ignoreBots && message.author.bot) {
            return;
          }

          if (ignoreSelf && input.client.user && message.author.id === input.client.user.id) {
            return;
          }

          for (const command of options.commands) {
            let matched = false;

            try {
              matched = await command.match({ message, context });
            } catch (error) {
              logger.error(`Message command match failed: ${command.data.name}`, error);
              input.diagnostics.record({
                type: "command_error",
                timestamp: new Date().toISOString(),
                kind: "message-command",
                commandName: command.data.name,
                guildId: message.guildId ?? null,
                userId: message.author.id ?? null,
                message: getErrorMessage(error),
              });
              return;
            }

            if (!matched) {
              continue;
            }

            const access = await evaluateExecutionAccess({
              registry: input.registry,
              context,
              kind: "message-command",
              subject: message,
              preconditions: command.preconditions,
              devOnly: command.devOnly,
              environment,
              fallbackMessage: "This message command is not available here.",
            });

            if (!access.ok) {
              await handleDeniedExecution({
                kind: "message-command",
                subject: message,
                context,
                reason: access.reason,
                localOnDenied: command.onDenied,
                diagnostics: input.diagnostics,
                metadata: {
                  commandName: command.data.name,
                  guildId: message.guildId ?? null,
                  userId: message.author.id ?? null,
                },
                reply: async (deniedMessage = access.reason.message) => {
                  await message.reply(deniedMessage);
                },
              });
              return;
            }

            if (
              await enforceNamedCooldown({
                commandName: command.data.name,
                commandCooldown: command.cooldown,
                identity: {
                  userId: message.author.id,
                  scopeKey: message.author.id,
                },
                cooldowns,
                reply: async (cooldownMessage) => {
                  await message.reply(cooldownMessage);
                },
              })
            ) {
              return;
            }

            try {
              await command.execute({ message, context });
            } catch (error) {
              logger.error(`Message command failed: ${command.data.name}`, error);
              input.diagnostics.record({
                type: "command_error",
                timestamp: new Date().toISOString(),
                kind: "message-command",
                commandName: command.data.name,
                guildId: message.guildId ?? null,
                userId: message.author.id ?? null,
                message: getErrorMessage(error),
              });
              await message.reply("An error occurred while processing the message command.");
            }

            return;
          }
        },
      });
    },
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
