import { Slot } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// react-native-web 在开发模式会对 View 的字符串子节点打 console.error
// （"Unexpected text node: . ..."，无害，纯属噪音），这里统一屏蔽。
const __origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].startsWith("Unexpected text node:")
  ) {
    return;
  }
  __origConsoleError.apply(console, args);
};
import { StatusBar } from "expo-status-bar";
import { useColorScheme, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import Provider from "@ant-design/react-native/es/provider";
import defaultTheme from "@ant-design/react-native/es/style/themes/default";
import type { Theme } from "@ant-design/react-native/es/style";
import AnnouncementBar from "../components/AnnouncementBar";
import SeoUpdater from "../components/SeoUpdater";
import HeadScripts from "../components/HeadScripts";
import { AuthProvider } from "../lib/auth";
import { FavoritesProvider } from "../lib/favorites";
import { SearchHistoryProvider } from "../lib/searchHistory";
import { restoreSavedLanguage } from "../lib/i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

/* ---------- Ant Design themes ---------- */

const lightTheme: Theme = {
  ...defaultTheme,
  // Primary palette — refined indigo
  brand_primary: "#4F46E5",
  brand_primary_tap: "#4338CA",
  primary_button_fill: "#4F46E5",
  primary_button_fill_tap: "#4338CA",
  ghost_button_color: "#4F46E5",
  ghost_button_fill_tap: "rgba(79,70,229,0.6)",
  color_link: "#4F46E5",
  // Text
  color_text_base: "#0F172A",
  color_text_base_inverse: "#FFFFFF",
  color_text_placeholder: "#94A3B8",
  color_text_disabled: "#CBD5E1",
  color_text_caption: "#64748B",
  color_text_paragraph: "#334155",
  color_icon_base: "#94A3B8",
  // Fills
  fill_body: "#F8FAFC",
  fill_base: "#FFFFFF",
  fill_tap: "#F1F5F9",
  fill_disabled: "#F1F5F9",
  fill_mask: "rgba(15,23,42,0.5)",
  fill_grey: "#F8FAFC",
  // Feedback
  brand_success: "#059669",
  brand_warning: "#D97706",
  brand_error: "#DC2626",
  brand_important: "#DC2626",
  // Borders
  border_color_base: "#E2E8F0",
  border_color_thin: "#F1F5F9",
  // Radii — slightly larger for modern feel
  radius_xs: 4,
  radius_sm: 6,
  radius_md: 10,
  radius_lg: 14,
  // Tab bar
  tab_bar_fill: "#FFFFFF",
  tab_bar_height: 56,
  // Search bar
  search_bar_fill: "#F1F5F9",
  // Toast
  toast_fill: "rgba(15,23,42,0.85)",
  // Switch
  switch_unchecked: "#CBD5E1",
};

const darkTheme: Theme = {
  ...defaultTheme,
  // Primary palette — luminous indigo
  brand_primary: "#818CF8",
  brand_primary_tap: "#6366F1",
  primary_button_fill: "#818CF8",
  primary_button_fill_tap: "#6366F1",
  ghost_button_color: "#818CF8",
  ghost_button_fill_tap: "rgba(129,140,248,0.5)",
  color_link: "#818CF8",
  // Text
  color_text_base: "#F1F5F9",
  color_text_base_inverse: "#0F172A",
  color_text_placeholder: "#64748B",
  color_text_disabled: "#334155",
  color_text_caption: "#94A3B8",
  color_text_paragraph: "#CBD5E1",
  color_icon_base: "#64748B",
  // Fills
  fill_body: "#0B1120",
  fill_base: "#1E293B",
  fill_tap: "#334155",
  fill_disabled: "#1E293B",
  fill_mask: "rgba(0,0,0,0.6)",
  fill_grey: "#0F172A",
  // Feedback
  brand_success: "#34D399",
  brand_warning: "#FBBF24",
  brand_error: "#F87171",
  brand_important: "#F87171",
  // Borders
  border_color_base: "rgba(148,163,184,0.15)",
  border_color_thin: "rgba(148,163,184,0.08)",
  // Radii
  radius_xs: 4,
  radius_sm: 6,
  radius_md: 10,
  radius_lg: 14,
  // Tab bar
  tab_bar_fill: "#0F172A",
  tab_bar_height: 56,
  // Search bar
  search_bar_fill: "#1E293B",
  // Toast
  toast_fill: "rgba(30,41,59,0.92)",
  // Switch
  switch_unchecked: "#334155",
};

/* ---------- Root layout ---------- */

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await restoreSavedLanguage();
      setLangReady(true);
    };
    init();
  }, []);

  // AntD 图标依赖 antoutline / antfill 字体，Web 端必须显式加载否则图标丢失
  const [fontsLoaded] = useFonts({
    antoutline: require("@ant-design/icons-react-native/fonts/antoutline.ttf"),
    antfill: require("@ant-design/icons-react-native/fonts/antfill.ttf"),
  });

  if (!fontsLoaded || !langReady) {
    return null;
  }

  return (
    <Provider theme={isDark ? darkTheme : lightTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FavoritesProvider>
            <SearchHistoryProvider>
              <StatusBar style={isDark ? "light" : "dark"} />
              <SeoUpdater />
              <HeadScripts />
              <View style={styles.root}>
                <AnnouncementBar />
                <View style={styles.content}>
                  <LanguageSwitcher />
                  <Slot />
                </View>
              </View>
            </SearchHistoryProvider>
          </FavoritesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
