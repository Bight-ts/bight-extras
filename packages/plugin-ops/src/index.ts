import {
  createLogger,
  defineCommand,
  definePlugin,
  definePrecondition,
  defineSubcommand,
  type BightContext,
  type BightDiagnosticEvent,
  type BightExecutionKind,
  type BightOfficialPluginOptions,
  type BightPluginLifecycle,
  type BightServiceMap,
  type MaybeBightPlugin,
} from "@bight-ts/core";
import {
  GatewayIntentBits,
  IntentsBitField,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const DEFAULT_MAINTENANCE_KINDS: BightExecutionKind[] = [
  "command",
  "autocomplete",
  "button",
  "modal",
  "select-menu",
  "message-command",
  "prefix-command",
];

export interface StartupCheckOutcome {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: Record<string, unknown>;
}

export interface StartupCheck<TServices extends BightServiceMap> {
  name: string;
  run(
    input: BightPluginLifecycle<TServices>,
  ):
    | Promise<StartupCheckOutcome | StartupCheckOutcome[] | void>
    | StartupCheckOutcome
    | StartupCheckOutcome[]
    | void;
}

export interface StartupChecksPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  mode?: "warn" | "fail";
  runOn?: "before-login" | "after-login" | "both";
  requiredEnv?: string[];
  requiredIntents?: GatewayIntentBits[];
  requiredServices?: Array<{
    name: string;
    get: (context: BightContext<TServices>) => unknown;
  }>;
  checks?: StartupCheck<TServices>[];
  includeDiagnosticsSource?: boolean;
  logPasses?: boolean;
}

export interface MaintenanceState {
  enabled: boolean;
  message?: string;
  allowUsers?: string[];
  allowGuilds?: string[];
  allowCommands?: string[];
}

export interface MaintenanceModePluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  getState: (
    context: BightContext<TServices>,
  ) => Promise<MaintenanceState> | MaintenanceState;
  setState?: (
    context: BightContext<TServices>,
    state: MaintenanceState,
  ) => Promise<void> | void;
  preconditionName?: string;
  kinds?: BightExecutionKind[];
  defaultMessage?: string;
  stateErrorMode?: "allow" | "deny";
  includeCommand?: boolean;
  commandName?: string;
  commandPreconditions?: string[];
}

export interface ErrorReporter {
  capture(input: {
    event: BightDiagnosticEvent;
    pluginName: string;
  }): Promise<void> | void;
}

export interface ErrorReporterPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  getReporter: (context: BightContext<TServices>) => ErrorReporter;
  includeDenied?: boolean;
  includeCommandErrors?: boolean;
  includeInteractionErrors?: boolean;
  includeTaskFailures?: boolean;
  redact?: (event: BightDiagnosticEvent) => BightDiagnosticEvent | null;
  onReporterError?: "log" | "throw" | "ignore";
}

export const defineStartupCheck = <
  TServices extends BightServiceMap = Record<string, never>,
>(
  check: StartupCheck<TServices>,
) => check;

export function createEnvStartupCheck<
  TServices extends BightServiceMap = Record<string, never>,
>(
  requiredEnv: string[],
): StartupCheck<TServices> {
  return defineStartupCheck({
    name: "required-env",
    run() {
      const missing = requiredEnv.filter((name) => !process.env[name]);

      return {
        name: "required-env",
        status: missing.length > 0 ? "fail" : "pass",
        message: missing.length > 0
          ? `Missing required environment variables: ${missing.join(", ")}`
          : "All required environment variables are present.",
        details: {
          requiredEnv,
          missing,
        },
      };
    },
  });
}

export function createIntentsStartupCheck<
  TServices extends BightServiceMap = Record<string, never>,
>(
  requiredIntents: GatewayIntentBits[],
): StartupCheck<TServices> {
  return defineStartupCheck({
    name: "required-intents",
    run({ client }) {
      const intents = new IntentsBitField(client.options.intents ?? []);
      const missing = requiredIntents.filter((intent) => !intents.has(intent));

      return {
        name: "required-intents",
        status: missing.length > 0 ? "fail" : "pass",
        message: missing.length > 0
          ? `Missing required gateway intents: ${missing.join(", ")}`
          : "All required gateway intents are enabled.",
        details: {
          requiredIntents,
          missing,
        },
      };
    },
  });
}

export function createServicesStartupCheck<TServices extends BightServiceMap>(
  services: StartupChecksPluginOptions<TServices>["requiredServices"] = [],
): StartupCheck<TServices> {
  return defineStartupCheck({
    name: "required-services",
    run({ context }) {
      const missing: string[] = [];

      for (const service of services) {
        try {
          if (service.get(context) == null) {
            missing.push(service.name);
          }
        } catch {
          missing.push(service.name);
        }
      }

      return {
        name: "required-services",
        status: missing.length > 0 ? "fail" : "pass",
        message: missing.length > 0
          ? `Missing required services: ${missing.join(", ")}`
          : "All required services are available.",
        details: {
          requiredServices: services.map((service) => service.name),
          missing,
        },
      };
    },
  });
}

export function createStartupChecksPlugin<TServices extends BightServiceMap>(
  options: StartupChecksPluginOptions<TServices> = {},
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "startup-checks";
  const logger = createLogger(options.loggerScope ?? pluginName);
  const mode = options.mode ?? (process.env.NODE_ENV === "production" ? "fail" : "warn");
  const runOn = options.runOn ?? "before-login";
  const includeDiagnosticsSource = options.includeDiagnosticsSource ?? true;
  const logPasses = options.logPasses ?? false;
  const checks: StartupCheck<TServices>[] = [
    ...(options.requiredEnv?.length ? [createEnvStartupCheck<TServices>(options.requiredEnv)] : []),
    ...(options.requiredIntents?.length
      ? [createIntentsStartupCheck<TServices>(options.requiredIntents)]
      : []),
    ...(options.requiredServices?.length
      ? [createServicesStartupCheck(options.requiredServices)]
      : []),
    ...(options.checks ?? []),
  ];
  let lastRunAt: string | null = null;
  let lastPhase: "before-login" | "after-login" | null = null;
  let lastOutcomes: StartupCheckOutcome[] = [];

  async function runChecks(
    phase: "before-login" | "after-login",
    input: BightPluginLifecycle<TServices>,
  ) {
    const outcomes = (
      await Promise.all(
        checks.map(async (check) => {
          const result = await check.run(input);
          if (!result) {
            return [];
          }

          return Array.isArray(result) ? result : [result];
        }),
      )
    ).flat();

    lastRunAt = new Date().toISOString();
    lastPhase = phase;
    lastOutcomes = outcomes;

    for (const outcome of outcomes) {
      if (outcome.status === "pass" && !logPasses) {
        continue;
      }

      const message = `[${pluginName}] ${outcome.name}: ${outcome.message}`;
      if (outcome.status === "fail") {
        logger.error(message, outcome.details);
        continue;
      }

      if (outcome.status === "warn") {
        logger.warn(message, outcome.details);
        continue;
      }

      logger.info(message, outcome.details);
    }

    if (mode === "fail" && outcomes.some((outcome) => outcome.status === "fail")) {
      const failures = outcomes
        .filter((outcome) => outcome.status === "fail")
        .map((outcome) => `${outcome.name}: ${outcome.message}`)
        .join("; ");

      throw new Error(`Startup checks failed: ${failures}`);
    }
  }

  return definePlugin({
    name: pluginName,
    setup(input) {
      if (!includeDiagnosticsSource) {
        return;
      }

      input.diagnostics.registerSource({
        name: "startup-checks",
        snapshot() {
          return {
            mode,
            runOn,
            lastRunAt,
            lastPhase,
            outcomes: lastOutcomes,
          };
        },
      });
    },
    async beforeLogin(input) {
      if (runOn === "before-login" || runOn === "both") {
        await runChecks("before-login", input);
      }
    },
    async afterLogin(input) {
      if (runOn === "after-login" || runOn === "both") {
        await runChecks("after-login", input);
      }
    },
  });
}

export function createMaintenanceModePlugin<TServices extends BightServiceMap>(
  options: MaintenanceModePluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "maintenance-mode";
  const logger = createLogger(options.loggerScope ?? pluginName);
  const preconditionName = options.preconditionName ?? "maintenance-mode";
  const kinds = options.kinds ?? DEFAULT_MAINTENANCE_KINDS;
  const defaultMessage =
    options.defaultMessage ?? "The bot is currently in maintenance mode.";
  const stateErrorMode = options.stateErrorMode ?? "allow";
  const includeCommand = options.includeCommand ?? false;
  const commandName = options.commandName ?? "maintenance";
  let lastState: MaintenanceState | null = null;
  let lastStateError: string | null = null;

  async function loadState(context: BightContext<TServices>) {
    try {
      const state = await options.getState(context);
      lastState = state;
      lastStateError = null;
      return state;
    } catch (error) {
      lastStateError = getErrorMessage(error);
      logger.error("Maintenance mode state lookup failed.", error);
      throw error;
    }
  }

  return definePlugin({
    name: pluginName,
    setup(input) {
      input.addPrecondition(
        definePrecondition({
          name: preconditionName,
          async check(execution) {
            let state: MaintenanceState;

            try {
              state = await loadState(execution.context);
            } catch {
              if (stateErrorMode === "allow") {
                return true;
              }

              return "Maintenance mode is currently unavailable.";
            }

            if (!state.enabled) {
              return true;
            }

            const userId = execution.interaction?.user.id ?? execution.message?.author.id;
            const guildId = execution.interaction?.guildId ?? execution.message?.guildId;
            const interactionCommandName =
              execution.interaction && "commandName" in execution.interaction
                ? execution.interaction.commandName
                : undefined;
            const resolvedCommandName = interactionCommandName;
            const allowCommands = new Set([
              ...(state.allowCommands ?? []),
              ...(includeCommand && options.setState ? [commandName] : []),
            ]);

            if (userId && state.allowUsers?.includes(userId)) {
              return true;
            }

            if (guildId && state.allowGuilds?.includes(guildId)) {
              return true;
            }

            if (resolvedCommandName && allowCommands.has(resolvedCommandName)) {
              return true;
            }

            return state.message ?? defaultMessage;
          },
        }),
      );

      input.addGlobalPrecondition({
        name: preconditionName,
        kinds,
      });

      input.diagnostics.registerSource({
        name: "maintenance-mode",
        snapshot() {
          return {
            enabled: lastState?.enabled ?? null,
            message: lastState?.message ?? null,
            configuredKinds: kinds,
            includeCommand: includeCommand && Boolean(options.setState),
            commandName: includeCommand && options.setState ? commandName : null,
            stateError: lastStateError,
          };
        },
      });

      if (!includeCommand || !options.setState) {
        return;
      }

      input.addCommand(
        defineCommand({
          data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription("Inspect or toggle maintenance mode."),
          preconditions: options.commandPreconditions,
          subcommands: [
            defineSubcommand({
              name: "status",
              description: "Show the current maintenance state.",
              async execute({ interaction, context }) {
                const state = await loadState(context);
                await interaction.reply({
                  content: [
                    `enabled: ${String(state.enabled)}`,
                    `message: ${state.message ?? "(default)"}`,
                  ].join("\n"),
                  flags: MessageFlags.Ephemeral,
                });
              },
            }),
            defineSubcommand({
              name: "enable",
              description: "Enable maintenance mode.",
              build(builder) {
                return builder.addStringOption((option) =>
                  option
                    .setName("message")
                    .setDescription("Optional maintenance message")
                    .setRequired(false),
                );
              },
              async execute({ interaction, context }) {
                const current = await loadState(context);
                const next: MaintenanceState = {
                  ...current,
                  enabled: true,
                  message: interaction.options.getString("message", false) ?? current.message,
                };
                await options.setState?.(context, next);
                lastState = next;
                await interaction.reply({
                  content: "Maintenance mode enabled.",
                  flags: MessageFlags.Ephemeral,
                });
              },
            }),
            defineSubcommand({
              name: "disable",
              description: "Disable maintenance mode.",
              async execute({ interaction, context }) {
                const current = await loadState(context);
                const next: MaintenanceState = {
                  ...current,
                  enabled: false,
                  message: undefined,
                };
                await options.setState?.(context, next);
                lastState = next;
                await interaction.reply({
                  content: "Maintenance mode disabled.",
                  flags: MessageFlags.Ephemeral,
                });
              },
            }),
          ],
        }),
      );
    },
  });
}

export function createErrorReporterPlugin<TServices extends BightServiceMap>(
  options: ErrorReporterPluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "error-reporter";
  const logger = createLogger(options.loggerScope ?? pluginName);
  const includeDenied = options.includeDenied ?? false;
  const includeCommandErrors = options.includeCommandErrors ?? true;
  const includeInteractionErrors = options.includeInteractionErrors ?? true;
  const includeTaskFailures = options.includeTaskFailures ?? true;
  const onReporterError = options.onReporterError ?? "log";
  let deliveredCount = 0;
  let droppedCount = 0;
  let lastDeliveredAt: string | null = null;
  let lastFailureAt: string | null = null;

  return definePlugin({
    name: pluginName,
    setup(input) {
      input.diagnostics.registerSource({
        name: "error-reporter",
        snapshot() {
          return {
            deliveredCount,
            droppedCount,
            lastDeliveredAt,
            lastFailureAt,
            includeDenied,
            includeCommandErrors,
            includeInteractionErrors,
            includeTaskFailures,
          };
        },
      });

      const reporter = options.getReporter(input.context);
      input.diagnostics.subscribe((event) => {
        if (!shouldCaptureEvent(event, {
          includeDenied,
          includeCommandErrors,
          includeInteractionErrors,
          includeTaskFailures,
        })) {
          return;
        }

        const redacted = options.redact ? options.redact(event) : event;
        if (!redacted) {
          droppedCount += 1;
          return;
        }

        try {
          void reporter.capture({
            event: redacted,
            pluginName,
          });
          deliveredCount += 1;
          lastDeliveredAt = new Date().toISOString();
        } catch (error) {
          lastFailureAt = new Date().toISOString();

          if (onReporterError === "ignore") {
            return;
          }

          if (onReporterError === "throw") {
            throw error;
          }

          logger.error("Error reporter delivery failed.", error);
        }
      });
    },
  });
}

function shouldCaptureEvent(
  event: BightDiagnosticEvent,
  options: {
    includeDenied: boolean;
    includeCommandErrors: boolean;
    includeInteractionErrors: boolean;
    includeTaskFailures: boolean;
  },
) {
  if (event.type === "command_denied") {
    return options.includeDenied;
  }

  if (event.type === "command_error") {
    return options.includeCommandErrors;
  }

  if (event.type === "interaction_error") {
    return options.includeInteractionErrors;
  }

  if (event.type === "task_failed") {
    return options.includeTaskFailures;
  }

  return false;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
