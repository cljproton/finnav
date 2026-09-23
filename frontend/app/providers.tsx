"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { FavoritesProvider } from "../lib/favorites";
import { SearchHistoryProvider } from "../lib/searchHistory";
import i18n from "../lib/i18n";
import { restoreSavedLanguage, normalizeLanguage, type AppLanguage } from "../lib/i18n";

function ReferralListener() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      import("../lib/referral").then(({ savePendingReferral }) => {
        savePendingReferral(ref);
      });
    }
  }, []);
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  );

  useEffect(() => {
    const applyLanguage = (lang: AppLanguage) => {
      i18n.changeLanguage(lang);
      // 同步 <html lang>（SSR 固定 en，中文用户水合后切 zh-CN）
      document.documentElement.setAttribute(
        "lang",
        lang === "zh" ? "zh-CN" : "en",
      );
    };

    const restoreLanguage = async () => {
      try {
        // First, check for URL language override (highest priority)
        let lang: string | null = null;
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const urlLang = params.get("lang");
          if (urlLang === "en" || urlLang === "zh") {
            lang = urlLang;
          }
        }

        // If no URL override, try to get saved language from localStorage
        if (!lang) {
          lang = await restoreSavedLanguage();
        }

        // Normalize the language to ensure it's valid
        const normalizedLang = lang ? normalizeLanguage(lang) : "en";
        // 推迟到水合完成后（双 rAF）再切换语言，避免流式水合期间
        // react-i18next 触发重渲染与 SSR(en) 内容对比产生 hydration mismatch
        if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => applyLanguage(normalizedLang)),
          );
        } else {
          applyLanguage(normalizedLang);
        }
      } catch (error) {
        console.error("Failed to restore language:", error);
        // Fallback to default language
        requestAnimationFrame(() => applyLanguage("zh"));
      }
    };

    restoreLanguage();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FavoritesProvider>
          <SearchHistoryProvider>
            <ReferralListener />
            {children}
          </SearchHistoryProvider>
        </FavoritesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}