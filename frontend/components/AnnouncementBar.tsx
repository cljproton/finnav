import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../lib/api";
import { useThemeColors } from "../constants/colors";

/**
 * 网站公告横条——放置在页面最上端（吸顶）。
 * 仅当后台「显示公告」开启且已填写公告内容时才渲染。
 */
export default function AnnouncementBar() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { data: settings } = useSettings();

  const show = settings?.announcement_enabled && settings?.announcement?.trim();
  if (!show) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.primary,
          paddingTop: insets.top + 8,
        },
      ]}
    >
      <View style={styles.inner}>
        <Ionicons
          name="megaphone"
          size={15}
          color={colors.surfaceSolid}
        />
        <Text style={[styles.text, { color: colors.surfaceSolid }]} numberOfLines={2}>
          {settings.announcement}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "center",
    lineHeight: 18,
  },
});