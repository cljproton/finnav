import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSettings } from "../lib/api";
import { useThemeColors } from "../constants/colors";
import { Logo } from "./Logo";

export default function PageHero({ title }: { title: string }) {
  const colors = useThemeColors();
  const { data: settings } = useSettings();

  const displayTitle = settings?.site_title || title;
  const subtitle = settings?.site_subtitle || undefined;

  return (
    <View style={styles.heroSection}>
      <View style={styles.logo}>
        <Logo uri={settings?.logo ?? null} size={48} />
      </View>
      <Text style={[styles.greeting, { color: colors.text }]}>
        {displayTitle}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  logo: {
    width: 48,
    height: 48,
    marginBottom: 12,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});