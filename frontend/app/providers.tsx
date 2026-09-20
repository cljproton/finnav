"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { FavoritesProvider } from "../lib/favorites";
import { SearchHistoryProvider } from "../lib/searchHistory";
import i18n from "../lib/i18n";
import { restoreSavedLanguage, normalizeLanguage } from "../lib/i18n";

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
        if (lang) {
          const normalizedLang = normalizeLanguage(lang);
          await i18n.changeLanguage(normalizedLang);
        }
      } catch (error) {
        console.error("Failed to restore language:", error);
        // Fallback to default language
        await i18n.changeLanguage("zh");
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