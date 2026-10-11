import type { Locale } from "./i18n";

const loaders = {
  en: () => import("@/messages/en.json").then((m) => m.default),
  ar: () => import("@/messages/ar.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof loaders)["en"]>>;
export const getDictionary = (locale: Locale): Promise<Dictionary> => loaders[locale]();
