import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSettings } from "../lib/api";
import { useThemeColors } from "../constants/colors";

/**
 * 页面底部版权信息——读取后台「全局设置」的 footer_copyright。
 * 为空时不渲染。
 */
export default function SiteFooter() {
  const colors = useThemeColors();
  const { data: settings } = useSettings();

  const text = settings?.footer_copyright;
  if (!text?.trim()) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: colors.textTertiary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 12,
    textAlign: "center",
  },
});