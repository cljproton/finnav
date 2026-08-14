import React, { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { Image } from "expo-image";

function getInitialColor(name: string): string {
  const palette = [
    "#4F46E5",
    "#7C3AED",
    "#2563EB",
    "#0891B2",
    "#059669",
    "#D97706",
    "#DC2626",
    "#DB2777",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

type LogoProps = {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: any;
};

export const Logo: React.FC<LogoProps> = ({ uri, name, size = 48, style }) => {
  const [loadError, setLoadError] = useState(false);
  const radius = size * 0.22;
  const baseStyle = { width: size, height: size, borderRadius: radius };

  const fallback = name ? (
    <View
      style={[
        styles.fallback,
        baseStyle,
        { backgroundColor: getInitialColor(name) },
        style,
      ]}
    >
      <Text style={[styles.fallbackText, { fontSize: size * 0.42 }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  ) : (
    <Image
      source={require("../assets/icon.png")}
      style={[baseStyle, style]}
      contentFit="contain"
    />
  );

  if (!uri || loadError) return fallback;

  return (
    <Image
      source={{ uri } as any}
      style={[baseStyle, style]}
      contentFit="cover"
      placeholderContentFit="contain"
      transition={200}
      onError={() => setLoadError(true)}
    />
  );
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fallbackText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});