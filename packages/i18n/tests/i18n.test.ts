import { Client } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  createBightRegistry,
  createLogger,
  createMemoryDiagnosticsHub,
} from "@bight-ts/core";
import { createI18nPlugin, createI18nService } from "../src/index.js";

describe("createI18nService", () => {
  it("translates explicit locales and falls back by language", () => {
    const i18n = createI18nService({
      fallbackLocale: "en",
      resources: {
        en: {
          greeting: "Hello",
        },
        es: {
          greeting: "Hola",
        },
      },
    });

    expect(i18n.t("es", "greeting")).toBe("Hola");
    expect(i18n.t("es-AR", "greeting")).toBe("Hola");
  });

  it("falls back to the configured locale when a key or locale is missing", () => {
    const i18n = createI18nService({
      fallbackLocale: "en",
      resources: {
        en: {
          greeting: "Hello",
          fallbackOnly: "Fallback",
        },
        es: {
          greeting: "Hola",
        },
      },
    });

    expect(i18n.t("fr", "greeting")).toBe("Hello");
    expect(i18n.t("es", "fallbackOnly")).toBe("Fallback");
  });

  it("resolves locale from interaction-shaped input", () => {
    const i18n = createI18nService({
      fallbackLocale: "en",
      resources: {
        en: {
          greeting: "Hello",
        },
        es: {
          greeting: "Hola",
        },
      },
    });

    const scoped = i18n.forInteraction({
      locale: "es-ES",
      guildLocale: null,
    });

    expect(scoped.locale).toBe("es");
    expect(scoped.t("greeting")).toBe("Hola");
  });
});

describe("createI18nPlugin", () => {
  it("registers an i18n diagnostics source", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry<{ i18n: ReturnType<typeof createI18nService>; }>();
    const diagnostics = createMemoryDiagnosticsHub<{ i18n: ReturnType<typeof createI18nService>; }>();
    const i18n = createI18nService({
      fallbackLocale: "en",
      resources: {
        en: {
          greeting: "Hello",
        },
        es: {
          greeting: "Hola",
        },
      },
    });
    const plugin = createI18nPlugin({
      getI18n: (context) => context.services.i18n,
    });

    await plugin?.setup?.({
      client,
      registry,
      diagnostics,
      pluginNames: ["i18n"],
      getEventCount: () => 0,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          i18n,
        },
      },
      addCommand() { },
      addPrecondition() { },
      addGlobalPrecondition() { },
      addButtonHandler() { },
      addModalHandler() { },
      addSelectMenuHandler() { },
      addEvent() { },
    });

    const snapshot = await diagnostics.createSnapshot({
      client,
      context: {
        client,
        logger: createLogger("test", { level: "debug" }),
        services: {
          i18n,
        },
      },
      registry,
      pluginNames: ["i18n"],
    });

    expect(snapshot.sources.i18n).toMatchObject({
      fallbackLocale: "en",
      locales: ["en", "es"],
    });

    client.destroy();
  });

  it("rejects non-Bight i18n services when validation is enabled", async () => {
    const client = new Client({ intents: [] });
    const registry = createBightRegistry<{ i18n: { t: () => string; resolveLocale: () => string; forInteraction: () => { locale: string; t: () => string; }; exists: () => boolean; }; }>();
    const diagnostics = createMemoryDiagnosticsHub();
    const plugin = createI18nPlugin({
      getI18n: (context) => context.services.i18n,
    });

    expect(() =>
      plugin?.setup?.({
        client,
        registry,
        diagnostics,
        pluginNames: ["i18n"],
        getEventCount: () => 0,
        context: {
          client,
          logger: createLogger("test", { level: "debug" }),
          services: {
            i18n: {
              t: () => "x",
              resolveLocale: () => "en",
              forInteraction: () => ({
                locale: "en",
                t: () => "x",
              }),
              exists: () => true,
            },
          },
        },
        addCommand() { },
        addPrecondition() { },
        addGlobalPrecondition() { },
        addButtonHandler() { },
        addModalHandler() { },
        addSelectMenuHandler() { },
        addEvent() { },
      }),
    ).toThrow("createI18nPlugin expects a service created by createI18nService()");

    client.destroy();
  });
});
