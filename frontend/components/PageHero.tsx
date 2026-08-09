import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useSettings } from "../lib/api";
import { useThemeColors } from "../constants/colors";

export default function PageHero({ title }: { title: string }) {
  const colors = useThemeColors();
  const { data: settings } = useSettings();

  const displayTitle = settings?.site_title || title;
  const subtitle = settings?.site_subtitle || undefined;

  return (
    <View style={styles.heroSection}>
      {settings?.logo ? (
        <Image
          source={{ uri: settings.logo }}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      )}
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