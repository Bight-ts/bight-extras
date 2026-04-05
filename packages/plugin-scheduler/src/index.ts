import {
  createLogger,
  definePlugin,
  type BightContext,
  type BightDiagnosticsSource,
  type BightOfficialPluginOptions,
  type BightPluginLifecycle,
  type BightServiceMap,
  type MaybeBightPlugin,
  type StorageContext,
  type StorageValue,
} from "@bight-ts/core";

export interface ScheduledTask<TServices extends BightServiceMap = Record<string, never>> {
  name: string;
  intervalMs: number;
  runOnStart?: boolean;
  run: (input: { context: BightContext<TServices>; }) => Promise<void> | void;
}

export interface SchedulerTaskState {
  taskName: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  nextRunAt?: string;
  consecutiveFailures: number;
  lastError?: string;
}

export interface SchedulerStateStore<TServices extends BightServiceMap> {
  get: (
    taskName: string,
    input: { context: BightContext<TServices>; },
  ) => Promise<SchedulerTaskState | undefined>;
  set: (
    taskName: string,
    state: SchedulerTaskState,
    input: { context: BightContext<TServices>; },
  ) => Promise<void>;
  list?: (input: {
    context: BightContext<TServices>;
  }) => Promise<SchedulerTaskState[]>;
}

export interface SchedulerPersistenceOptions<TServices extends BightServiceMap> {
  store: SchedulerStateStore<TServices>;
  recoveryMode?: "run-missed-once" | "skip-to-next";
}

export interface SchedulerPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  tasks: ScheduledTask<TServices>[];
  persistence?: SchedulerPersistenceOptions<TServices>;
  clock?: () => number;
}

const defaultClock = () => Date.now();

export const defineScheduledTask = <T extends ScheduledTask<any>>(task: T) => task;

export function createSchedulerPlugin<TServices extends BightServiceMap>(
  options: SchedulerPluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "scheduler";
  const logger = createLogger(options.loggerScope ?? "scheduler");
  const clock = options.clock ?? defaultClock;
  const recoveryMode = options.persistence?.recoveryMode ?? "run-missed-once";
  const stateCache = new Map<string, SchedulerTaskState>();
  const timers = new Map<string, NodeJS.Timeout>();

  return definePlugin({
    name: pluginName,
    setup(input) {
      input.diagnostics.registerSource(
        createSchedulerDiagnosticsSource({
          pluginName,
          tasks: options.tasks,
          persistence: options.persistence,
          stateCache,
        }),
      );
    },
    async afterLogin(input) {
      for (const task of options.tasks) {
        await initializeTask(task, {
          ...input,
          pluginName,
          logger,
          clock,
          recoveryMode,
          persistence: options.persistence,
          stateCache,
          timers,
        });
      }
    },
  });
}

export function createStorageSchedulerStore<TServices extends BightServiceMap>(options: {
  getStorage: (context: BightContext<TServices>) => StorageContext;
  namespace?: string;
}): SchedulerStateStore<TServices> {
  const namespace = options.namespace ?? "bight:scheduler";

  return {
    async get(taskName, input) {
      const state = await readNamespace(options.getStorage(input.context), namespace);
      return state[taskName];
    },
    async set(taskName, taskState, input) {
      const storage = options.getStorage(input.context);
      const state = await readNamespace(storage, namespace);
      state[taskName] = taskState;
      await storage.global.set(namespace, state);
    },
    async list(input) {
      const state = await readNamespace(options.getStorage(input.context), namespace);
      return Object.values(state).filter(isSchedulerTaskState);
    },
  };
}

interface SchedulerRuntimeInput<TServices extends BightServiceMap>
  extends BightPluginLifecycle<TServices> {
  pluginName: string;
  logger: ReturnType<typeof createLogger>;
  clock: () => number;
  recoveryMode: "run-missed-once" | "skip-to-next";
  persistence?: SchedulerPersistenceOptions<TServices>;
  stateCache: Map<string, SchedulerTaskState>;
  timers: Map<string, NodeJS.Timeout>;
}

async function initializeTask<TServices extends BightServiceMap>(
  task: ScheduledTask<TServices>,
  input: SchedulerRuntimeInput<TServices>,
) {
  const state = await readTaskState(task.name, input);
  const now = input.clock();
  const scheduledAt = state?.nextRunAt ? Date.parse(state.nextRunAt) : Number.NaN;

  if (state?.nextRunAt && Number.isFinite(scheduledAt)) {
    if (scheduledAt > now) {
      await scheduleTask(task, input, scheduledAt);
      return;
    }

    if (input.recoveryMode === "skip-to-next") {
      await scheduleTask(task, input, now + task.intervalMs);
      return;
    }

    await runTask(task, input);
    return;
  }

  if (task.runOnStart) {
    await runTask(task, input);
    return;
  }

  await scheduleTask(task, input, now + task.intervalMs);
}

async function runTask<TServices extends BightServiceMap>(
  task: ScheduledTask<TServices>,
  input: SchedulerRuntimeInput<TServices>,
) {
  const startedAt = new Date(input.clock()).toISOString();
  const previousState = await readTaskState(task.name, input);
  await persistState(
    {
      taskName: task.name,
      lastStartedAt: startedAt,
      lastFinishedAt: previousState?.lastFinishedAt,
      nextRunAt: previousState?.nextRunAt,
      consecutiveFailures: previousState?.consecutiveFailures ?? 0,
      lastError: previousState?.lastError,
    },
    input,
  );

  input.diagnostics.record({
    type: "task_started",
    timestamp: startedAt,
    pluginName: input.pluginName,
    taskName: task.name,
    persistenceEnabled: Boolean(input.persistence),
  });

  try {
    await task.run({ context: input.context });

    const finishedAt = new Date(input.clock()).toISOString();
    await persistState(
      {
        taskName: task.name,
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        consecutiveFailures: 0,
      },
      input,
    );

    input.diagnostics.record({
      type: "task_succeeded",
      timestamp: finishedAt,
      pluginName: input.pluginName,
      taskName: task.name,
      finishedAt,
      persistenceEnabled: Boolean(input.persistence),
    });
  } catch (error) {
    const finishedAt = new Date(input.clock()).toISOString();
    const previous = await readTaskState(task.name, input);
    const message = getErrorMessage(error);

    await persistState(
      {
        taskName: task.name,
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
        lastError: message,
      },
      input,
    );

    input.diagnostics.record({
      type: "task_failed",
      timestamp: finishedAt,
      pluginName: input.pluginName,
      taskName: task.name,
      finishedAt,
      persistenceEnabled: Boolean(input.persistence),
      message,
    });
    input.logger.error(`Scheduled task failed: ${task.name}`, error);
  }

  await scheduleTask(task, input, input.clock() + task.intervalMs);
}

async function scheduleTask<TServices extends BightServiceMap>(
  task: ScheduledTask<TServices>,
  input: SchedulerRuntimeInput<TServices>,
  nextRunAtMs: number,
) {
  const nextRunAt = new Date(nextRunAtMs).toISOString();
  const delayMs = Math.max(nextRunAtMs - input.clock(), 0);
  const previousState = await readTaskState(task.name, input);

  await persistState(
    {
      taskName: task.name,
      lastStartedAt: previousState?.lastStartedAt,
      lastFinishedAt: previousState?.lastFinishedAt,
      nextRunAt,
      consecutiveFailures: previousState?.consecutiveFailures ?? 0,
      lastError: previousState?.lastError,
    },
    input,
  );

  input.diagnostics.record({
    type: "task_scheduled",
    timestamp: new Date(input.clock()).toISOString(),
    pluginName: input.pluginName,
    taskName: task.name,
    nextRunAt,
    delayMs,
    persistenceEnabled: Boolean(input.persistence),
  });

  const existingTimer = input.timers.get(task.name);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timeout = setTimeout(() => {
    input.timers.delete(task.name);
    void runTask(task, input);
  }, delayMs);
  input.timers.set(task.name, timeout);
}

async function readTaskState<TServices extends BightServiceMap>(
  taskName: string,
  input: SchedulerRuntimeInput<TServices>,
) {
  if (input.stateCache.has(taskName)) {
    return input.stateCache.get(taskName);
  }

  const persisted = input.persistence
    ? await input.persistence.store.get(taskName, { context: input.context })
    : undefined;
  if (persisted) {
    input.stateCache.set(taskName, persisted);
    return persisted;
  }

  return undefined;
}

async function persistState<TServices extends BightServiceMap>(
  state: SchedulerTaskState,
  input: SchedulerRuntimeInput<TServices>,
) {
  input.stateCache.set(state.taskName, state);

  if (!input.persistence) {
    return;
  }

  await input.persistence.store.set(state.taskName, state, {
    context: input.context,
  });
}

function createSchedulerDiagnosticsSource<TServices extends BightServiceMap>(options: {
  pluginName: string;
  tasks: ScheduledTask<TServices>[];
  persistence?: SchedulerPersistenceOptions<TServices>;
  stateCache: Map<string, SchedulerTaskState>;
}): BightDiagnosticsSource<TServices> {
  return {
    name: "scheduler",
    async snapshot(input) {
      const states = options.persistence?.store.list
        ? await options.persistence.store.list({ context: input.context })
        : await Promise.all(
          options.tasks.map(async (task) =>
            options.persistence?.store.get(task.name, { context: input.context })
            ?? options.stateCache.get(task.name),
          ),
        );

      const stateByTask = new Map(
        states
          .filter((state): state is SchedulerTaskState => Boolean(state))
          .map((state) => [state.taskName, state]),
      );

      return {
        pluginName: options.pluginName,
        persistenceEnabled: Boolean(options.persistence),
        tasks: options.tasks.map((task) => ({
          name: task.name,
          intervalMs: task.intervalMs,
          runOnStart: Boolean(task.runOnStart),
          state: stateByTask.get(task.name) ?? {
            taskName: task.name,
            consecutiveFailures: 0,
          },
        })),
      };
    },
  };
}

async function readNamespace(storage: StorageContext, namespace: string) {
  const state = await storage.global.get<Record<string, SchedulerTaskState> & StorageValue>(
    namespace,
  );

  return isSchedulerStateMap(state) ? state : {};
}

function isSchedulerStateMap(
  value: unknown,
): value is Record<string, SchedulerTaskState> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchedulerTaskState(value: unknown): value is SchedulerTaskState {
  return Boolean(value) && typeof value === "object" && value !== null && "taskName" in value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
