import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "../constants/colors";
import { getEffectiveLanguage, setAppLanguage, type AppLanguage } from "../lib/i18n";

export default function LanguageSwitcher() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const current = getEffectiveLanguage();

  const languages: Array<{ code: AppLanguage; label: string }> = [
    { code: "zh", label: "中" },
    { code: "en", label: "EN" },
  ];

  return (
    <View
      style={[styles.container, { top: insets.top + 8, right: 8 }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.segment,
          {
            backgroundColor: colors.chipBg,
            borderColor: colors.border,
          },
        ]}
      >
        {languages.map((lang) => {
          const active = lang.code === current;
          return (
            <Pressable
              key={lang.code}
              onPress={async () => {
                if (lang.code === current) return;
                await setAppLanguage(lang.code);
              }}
              style={[
                styles.seg,
                {
                  backgroundColor: active ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.segText,
                  { color: active ? colors.surfaceSolid : colors.textSecondary },
                ]}
              >
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 8,
    zIndex: 1000,
    elevation: 10,
  },
  segment: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  seg: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  segText: {
    fontSize: 12,
    fontWeight: "600",
  },
});