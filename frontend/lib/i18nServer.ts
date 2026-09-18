import i18next from "i18next";
import { en } from "./i18n/translations";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

const resources = {
  zh: { translation: {} as Record<string, string> },
  en: { translation: en },
};

function normalizeLanguage(lng: string | null | undefined): "zh" | "en" {
  if (lng === "zh" || (typeof lng === "string" && lng.startsWith("zh"))) return "zh";
  return "en";
}

let serverInstance: typeof i18next | null = null;

export function serverI18n(lng?: string): Translate {
  const lang = normalizeLanguage(lng);
  if (!serverInstance) {
    serverInstance = i18next.createInstance();
    serverInstance.init({
      resources,
      lng: lang,
      fallbackLng: "zh",
      interpolation: { escapeValue: false },
    });
  }
  return serverInstance.t.bind(serverInstance);
}