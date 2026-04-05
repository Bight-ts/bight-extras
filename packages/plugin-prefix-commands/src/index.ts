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

export interface PrefixCommandData {
  name: string;
  aliases?: string[];
  description?: string;
  usage?: string;
}

export interface PrefixCommandExecution<TServices extends BightServiceMap> {
  message: Message<boolean>;
  context: BightContext<TServices>;
  prefix: string;
  commandName: string;
  args: string[];
  rawArgs: string;
}

export interface PrefixCommand<TServices extends BightServiceMap = Record<string, never>> {
  data: PrefixCommandData;
  cooldown?: number;
  devOnly?: boolean;
  preconditions?: string[];
  onDenied?: BightDeniedHandler<TServices, Message<boolean>>;
  execute: (
    input: PrefixCommandExecution<TServices>,
  ) => Promise<void> | void;
}

export interface PrefixCommandsPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  commands: PrefixCommand<TServices>[];
  getPrefixes: (input: {
    context: BightContext<TServices>;
    message: Message<boolean>;
  }) => Promise<string[]> | string[];
  allowMentionPrefix?: boolean;
  caseSensitive?: boolean;
  ignoreBots?: boolean;
  ignoreSelf?: boolean;
  stripPrefixWhitespace?: boolean;
  cooldowns?: Partial<Omit<CooldownOptions, "store">> & { store?: CooldownStore; };
}

export const definePrefixCommand = <
  TServices extends BightServiceMap = Record<string, never>,
>(
  command: PrefixCommand<TServices>,
) => command;

export function createPrefixCommandsPlugin<TServices extends BightServiceMap>(
  options: PrefixCommandsPluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "prefix-commands";
  const logger = createLogger(options.loggerScope ?? "prefix-commands");
  const allowMentionPrefix = options.allowMentionPrefix ?? true;
  const caseSensitive = options.caseSensitive ?? false;
  const ignoreBots = options.ignoreBots ?? true;
  const ignoreSelf = options.ignoreSelf ?? true;
  const stripPrefixWhitespace = options.stripPrefixWhitespace ?? true;
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
        async execute({ args: eventArgs, context }) {
          const message = eventArgs[0] as Message<boolean> | undefined;
          if (!message) {
            return;
          }

          if (ignoreBots && message.author.bot) {
            return;
          }

          if (ignoreSelf && input.client.user && message.author.id === input.client.user.id) {
            return;
          }

          const prefixes = await options.getPrefixes({ context, message });
          const matchedPrefix = resolvePrefix({
            prefixes,
            message,
            allowMentionPrefix,
          });
          if (!matchedPrefix) {
            return;
          }

          const withoutPrefix = message.content.slice(matchedPrefix.length);
          const trimmed = stripPrefixWhitespace ? withoutPrefix.trimStart() : withoutPrefix;
          const [rawCommandName = "", ...args] = trimmed.split(/\s+/).filter(Boolean);
          if (!rawCommandName) {
            return;
          }

          const rawArgs = trimmed.slice(rawCommandName.length).trimStart();
          const command = findPrefixCommand(options.commands, rawCommandName, caseSensitive);
          if (!command) {
            return;
          }

          const access = await evaluateExecutionAccess({
            registry: input.registry,
            context,
            kind: "prefix-command",
            subject: message,
            preconditions: command.preconditions,
            devOnly: command.devOnly,
            environment,
            fallbackMessage: "This prefix command is not available here.",
          });

          if (!access.ok) {
            await handleDeniedExecution({
              kind: "prefix-command",
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
            await command.execute({
              message,
              context,
              prefix: matchedPrefix,
              commandName: rawCommandName,
              args,
              rawArgs,
            });
          } catch (error) {
            logger.error(`Prefix command failed: ${command.data.name}`, error);
            input.diagnostics.record({
              type: "command_error",
              timestamp: new Date().toISOString(),
              kind: "prefix-command",
              commandName: command.data.name,
              guildId: message.guildId ?? null,
              userId: message.author.id ?? null,
              message: getErrorMessage(error),
            });
            await message.reply("An error occurred while processing the prefix command.");
          }
        },
      });
    },
  });
}

function resolvePrefix(options: {
  prefixes: string[];
  message: Message<boolean>;
  allowMentionPrefix: boolean;
}) {
  const prefixes = [...options.prefixes];

  if (options.allowMentionPrefix && options.message.client.user) {
    const userId = options.message.client.user.id;
    prefixes.push(`<@${userId}>`, `<@!${userId}>`);
  }

  return prefixes
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((prefix) => options.message.content.startsWith(prefix));
}

function findPrefixCommand<TServices extends BightServiceMap>(
  commands: PrefixCommand<TServices>[],
  rawCommandName: string,
  caseSensitive: boolean,
) {
  const needle = caseSensitive ? rawCommandName : rawCommandName.toLowerCase();

  return commands.find((command) => {
    const names = [command.data.name, ...(command.data.aliases ?? [])];

    return names.some((name) => (caseSensitive ? name : name.toLowerCase()) === needle);
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
