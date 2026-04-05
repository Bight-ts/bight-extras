import {
  createLogger,
  definePlugin,
  type BightContext,
  type BightDiagnosticsSource,
  type BightOfficialPluginOptions,
  type BightServiceMap,
  type MaybeBightPlugin,
} from "@bight-ts/core";
import { createInstance, type InitOptions } from "i18next";

const I18N_META = Symbol("bight.i18n.meta");

export interface I18nService {
  resolveLocale(input: {
    locale?: string | null;
    guildLocale?: string | null;
  }): string;
  t(locale: string, key: string, values?: Record<string, unknown>): string;
  forInteraction(interaction: {
    locale?: string | null;
    guildLocale?: string | null;
  }): {
    locale: string;
    t: (key: string, values?: Record<string, unknown>) => string;
  };
  exists(locale: string, key: string): boolean;
}

export interface CreateI18nServiceOptions {
  fallbackLocale: string;
  resources: Record<string, Record<string, unknown>>;
  defaultNamespace?: string;
}

export interface I18nPluginOptions<TServices extends BightServiceMap>
  extends BightOfficialPluginOptions {
  getI18n: (context: BightContext<TServices>) => I18nService;
  validateOnStartup?: boolean;
  reportResources?: boolean;
}

interface I18nMetadata {
  fallbackLocale: string;
  defaultNamespace: string;
  locales: string[];
  resources: Record<string, Record<string, unknown>>;
}

type ManagedI18nService = I18nService & {
  [I18N_META]: I18nMetadata;
};

export function createI18nService(options: CreateI18nServiceOptions): I18nService {
  validateResources(options.resources, options.fallbackLocale);

  const defaultNamespace = options.defaultNamespace ?? "translation";
  const instance = createInstance();
  const locales = Object.keys(options.resources);
  const localeLookup = createLocaleLookup(locales);

  const initOptions: InitOptions = {
    lng: options.fallbackLocale,
    fallbackLng: options.fallbackLocale,
    defaultNS: defaultNamespace,
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    resources: Object.fromEntries(
      Object.entries(options.resources).map(([locale, resource]) => [
        locale,
        {
          [defaultNamespace]: resource,
        },
      ]),
    ),
  };

  void instance.init(initOptions);

  const resolveLocale = (input: {
    locale?: string | null;
    guildLocale?: string | null;
  }) =>
    findSupportedLocale(input.locale, localeLookup)
    ?? findSupportedLocale(input.guildLocale, localeLookup)
    ?? options.fallbackLocale;

  const translate = (
    locale: string,
    key: string,
    values?: Record<string, unknown>,
  ) =>
    normalizeTranslation(
      instance.t(key, {
        lng: resolveLocale({ locale }),
        ns: defaultNamespace,
        ...values,
      }),
    );

  const service: ManagedI18nService = {
    resolveLocale,
    t(locale, key, values) {
      return translate(locale, key, values);
    },
    forInteraction(interaction) {
      const locale = resolveLocale(interaction);
      return {
        locale,
        t: (key, values) => translate(locale, key, values),
      };
    },
    exists(locale, key) {
      return instance.exists(key, {
        lng: resolveLocale({ locale }),
        ns: defaultNamespace,
      });
    },
    [I18N_META]: {
      fallbackLocale: options.fallbackLocale,
      defaultNamespace,
      locales,
      resources: options.resources,
    },
  };

  return service;
}

export function createI18nPlugin<TServices extends BightServiceMap>(
  options: I18nPluginOptions<TServices>,
): MaybeBightPlugin<TServices> {
  if (options.enabled === false) {
    return null;
  }

  const pluginName = options.name ?? "i18n";
  const logger = createLogger(options.loggerScope ?? "i18n");
  const validateOnStartup = options.validateOnStartup ?? true;
  const reportResources = options.reportResources ?? true;

  return definePlugin({
    name: pluginName,
    setup(input) {
      const service = options.getI18n(input.context);
      const metadata = getManagedI18nMetadata(service);

      if (validateOnStartup && !metadata) {
        throw new Error(
          "createI18nPlugin expects a service created by createI18nService().",
        );
      }

      input.diagnostics.registerSource(
        createI18nDiagnosticsSource({
          pluginName,
          service,
          reportResources,
        }),
      );

      if (!metadata) {
        logger.warn("I18n plugin is running without Bight-managed diagnostics metadata.");
        return;
      }

      logger.info(
        `Loaded i18n locales: ${metadata.locales.join(", ")} (fallback: ${metadata.fallbackLocale})`,
      );
    },
  });
}

function createI18nDiagnosticsSource<TServices extends BightServiceMap>(options: {
  pluginName: string;
  service: I18nService;
  reportResources: boolean;
}): BightDiagnosticsSource<TServices> {
  return {
    name: "i18n",
    snapshot() {
      const metadata = getManagedI18nMetadata(options.service);

      return {
        pluginName: options.pluginName,
        managedByBight: Boolean(metadata),
        fallbackLocale: metadata?.fallbackLocale ?? null,
        defaultNamespace: metadata?.defaultNamespace ?? null,
        locales: metadata?.locales ?? [],
        resources: options.reportResources && metadata
          ? Object.fromEntries(
            Object.entries(metadata.resources).map(([locale, resource]) => [
              locale,
              {
                keyCount: countLeafKeys(resource),
              },
            ]),
          )
          : undefined,
      };
    },
  };
}

function getManagedI18nMetadata(service: I18nService) {
  return (service as Partial<ManagedI18nService>)[I18N_META];
}

function createLocaleLookup(locales: string[]) {
  return new Map(locales.map((locale) => [locale.toLowerCase(), locale]));
}

function findSupportedLocale(
  locale: string | null | undefined,
  lookup: Map<string, string>,
) {
  if (!locale) {
    return undefined;
  }

  const direct = lookup.get(locale.toLowerCase());
  if (direct) {
    return direct;
  }

  const baseLanguage = locale.toLowerCase().split(/[-_]/)[0];
  if (!baseLanguage) {
    return undefined;
  }

  return (
    lookup.get(baseLanguage)
    ?? [...lookup.entries()].find(([candidate]) => candidate.split(/[-_]/)[0] === baseLanguage)?.[1]
  );
}

function validateResources(
  resources: Record<string, Record<string, unknown>>,
  fallbackLocale: string,
) {
  const locales = Object.keys(resources);
  if (locales.length === 0) {
    throw new Error("createI18nService requires at least one locale.");
  }

  if (!(fallbackLocale in resources)) {
    throw new Error(
      `Fallback locale "${fallbackLocale}" must be present in the i18n resources.`,
    );
  }

  for (const [locale, resource] of Object.entries(resources)) {
    if (!isPlainObject(resource)) {
      throw new Error(`Locale "${locale}" must map to a plain object.`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countLeafKeys(value: unknown): number {
  if (!isPlainObject(value)) {
    return 1;
  }

  return Object.values(value).reduce<number>(
    (total, entry) => total + countLeafKeys(entry),
    0,
  );
}

function normalizeTranslation(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}
