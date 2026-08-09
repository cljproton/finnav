import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { en } from "./i18n/translations";

export type AppLanguage = "zh" | "en";

export const LANG_STORAGE_KEY = "app_language";

// zh 直接用 key 本身（中文原文做 key）
// en 走翻译字典
const resources = {
  zh: { translation: {} as Record<string, string> },
  en: { translation: en },
};

const deviceLang = (): string => {
  for (const l of getLocales()) {
    if (l.languageCode) return l.languageCode.toLowerCase();
    if (l.languageTag) return l.languageTag.toLowerCase();
  }
  return "";
};

export function detectInitialLanguage(): AppLanguage {
  const device = deviceLang();
  if (device.startsWith("zh")) return "zh"; // 匹配客户端语言
  // 未匹配 -> 英文
  return "en";
}

export function normalizeLanguage(lng: string | null | undefined): AppLanguage {
  if (lng === "zh" || (typeof lng === "string" && lng.startsWith("zh"))) return "zh";
  return "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// 从本地缓存恢复用户手动选择的语言（有则覆盖设备语言）
export async function restoreSavedLanguage(): Promise<AppLanguage> {
  try {
    const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (!saved) return i18n.language as AppLanguage;
    const lang = normalizeLanguage(saved);
    if (lang !== i18n.language) {
      await i18n.changeLanguage(lang);
    }
    return lang;
  } catch {
    return i18n.language as AppLanguage;
  }
}

// 需要被 storage 攒一个 languageCode 的情况
export function getEffectiveLanguage(): AppLanguage {
  return normalizeLanguage(i18n.language);
}

export async function setAppLanguage(lang: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function getAcceptLanguage(): string {
  return getEffectiveLanguage() === "zh" ? "zh-Hans" : "en-US";
}

// 给 fetch 请求统一附加 Accept-Language 头（后端按该头返回对应语言文案）
export function withLanguageHeaders(headers?: Record<string, string>): Record<string, string> {
  return { ...headers, "Accept-Language": getAcceptLanguage() };
}

export default i18n;