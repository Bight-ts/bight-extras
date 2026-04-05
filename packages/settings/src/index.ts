import type {
  StorageContext,
  StorageObject,
  StorageValue,
} from "@bight-ts/core";
import type { z } from "zod";

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export interface GuildSettingsService<TSettings extends StorageObject> {
  get(guildId: string): Promise<TSettings>;
  update(guildId: string, patch: Partial<TSettings>): Promise<TSettings>;
  set(guildId: string, value: TSettings): Promise<TSettings>;
  reset(guildId: string): Promise<TSettings>;
}

export interface GlobalSettingService<TValue extends StorageValue> {
  get(): Promise<TValue>;
  set(value: TValue): Promise<TValue>;
  reset(): Promise<TValue>;
}

export interface CreateGuildSettingsServiceOptions<TSettings extends StorageObject> {
  storage: StorageContext;
  key: string;
  defaults: TSettings;
  schema?: z.ZodType<TSettings>;
  migrate?: (value: unknown) => TSettings | Partial<TSettings>;
}

export interface CreateGlobalSettingServiceOptions<TValue extends StorageValue> {
  storage: StorageContext;
  key: string;
  defaultValue: TValue;
  schema?: z.ZodType<TValue>;
  migrate?: (value: unknown) => TValue;
}

export function createGuildSettingsService<TSettings extends StorageObject>(
  options: CreateGuildSettingsServiceOptions<TSettings>,
): GuildSettingsService<TSettings> {
  const defaults = normalizeGuildShape(options.defaults, options.defaults);

  return {
    async get(guildId) {
      const stored = await options.storage.guilds.get<StorageValue>(guildId, options.key);
      const normalized = normalizeGuildValue(stored, defaults, options);
      await options.storage.guilds.set(guildId, options.key, normalized);
      return normalized;
    },
    async update(guildId, patch) {
      const current = await this.get(guildId);
      const normalized = normalizeGuildShape({
        ...current,
        ...stripUndefinedEntries(patch),
      }, defaults);
      await options.storage.guilds.set(guildId, options.key, normalized);
      return normalized;
    },
    async set(guildId, value) {
      const normalized = normalizeGuildShape(value, defaults, options.schema);
      await options.storage.guilds.set(guildId, options.key, normalized);
      return normalized;
    },
    async reset(guildId) {
      await options.storage.guilds.set(guildId, options.key, defaults);
      return defaults;
    },
  };
}

export function createGlobalSettingService<TValue extends StorageValue>(
  options: CreateGlobalSettingServiceOptions<TValue>,
): GlobalSettingService<TValue> {
  const defaultValue = normalizeGlobalValue(options.defaultValue, options.schema);

  return {
    async get() {
      const stored = await options.storage.global.get<StorageValue>(options.key);
      const normalized = stored === undefined
        ? defaultValue
        : normalizeGlobalValue(
          options.migrate ? options.migrate(stored) : stored,
          options.schema,
        ) as TValue;
      await options.storage.global.set(options.key, normalized);
      return normalized;
    },
    async set(value) {
      const normalized = normalizeGlobalValue(value, options.schema);
      await options.storage.global.set(options.key, normalized);
      return normalized;
    },
    async reset() {
      await options.storage.global.set(options.key, defaultValue);
      return defaultValue;
    },
  };
}

function normalizeGuildValue<TSettings extends StorageObject>(
  value: StorageValue | undefined,
  defaults: TSettings,
  options: CreateGuildSettingsServiceOptions<TSettings>,
) {
  if (value === undefined) {
    return defaults;
  }

  const migrated = options.migrate ? options.migrate(value) : value;

  if (!isPlainObject(migrated)) {
    throw new SettingsValidationError(
      `Guild settings for "${options.key}" must resolve to a plain object.`,
    );
  }

  return normalizeGuildShape(migrated as Partial<TSettings>, defaults, options.schema);
}

function normalizeGuildShape<TSettings extends StorageObject>(
  value: Partial<TSettings>,
  defaults: TSettings,
  schema?: z.ZodType<TSettings>,
) {
  const merged = {
    ...defaults,
    ...stripUndefinedEntries(value),
  };

  return validateSettings(merged, schema, "Guild settings failed validation.");
}

function normalizeGlobalValue<TValue extends StorageValue>(
  value: TValue,
  schema?: z.ZodType<TValue>,
) {
  const sanitized = sanitizeStorageValue(value) as TValue;
  return validateSettings(sanitized, schema, "Global setting failed validation.");
}

function validateSettings<TValue>(
  value: TValue,
  schema: z.ZodType<TValue> | undefined,
  fallbackMessage: string,
) {
  if (!schema) {
    return value;
  }

  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof Error) {
      throw new SettingsValidationError(error.message);
    }

    throw new SettingsValidationError(fallbackMessage);
  }
}

function stripUndefinedEntries<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => sanitizeStorageValue(entry)) as TValue;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, sanitizeStorageValue(entry)]),
  ) as TValue;
}

function sanitizeStorageValue(value: unknown): StorageValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => sanitizeStorageValue(entry));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, sanitizeStorageValue(entry)]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
