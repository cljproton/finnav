import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import type { Site } from "../lib/types";
import { useFavorites } from "../lib/favorites";
import { useThemeColors } from "../constants/colors";

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

function Logo({ uri, name, size = 48 }: { uri: string | null; name: string; size?: number }) {
  if (uri) {
    return (
      <View
        style={[
          styles.logoWrap,
          {
            width: size,
            height: size,
            borderRadius: size * 0.22,
            backgroundColor: "rgba(79,70,229,0.08)",
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size * 0.22 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  const bg = getInitialColor(name);
  const initial = name.charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.logoWrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={[styles.logoText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

interface SiteCardProps {
  site: Site;
  showFavorite?: boolean;
}

export default function SiteCard({ site, showFavorite = true }: SiteCardProps) {
  const colors = useThemeColors();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(site.id);
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: pressed ? colors.borderGlow : colors.border,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      onPress={() => router.push(`/site/${site.id}`)}
    >
      <View style={styles.row}>
        <Logo uri={site.logo} name={site.name} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={1}
            >
              {site.name}
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                Linking.openURL(site.url);
              }}
              hitSlop={8}
              style={styles.externalBtn}
            >
              <Ionicons
                name="open-outline"
                size={13}
                color={colors.textTertiary}
              />
            </Pressable>
          </View>
          <Text
            style={[styles.desc, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {site.description}
          </Text>
          <View style={styles.tagRow}>
            <View
              style={[
                styles.tag,
                {
                  backgroundColor: colors.primaryLight,
                  borderWidth: 0.5,
                  borderColor: colors.borderGlow,
                },
              ]}
            >
              <Text style={[styles.tagText, { color: colors.primary }]}>
                {site.category_name}
              </Text>
            </View>
            {site.tags.slice(0, 2).map((tag, idx) => (
              <View
                key={`${tag}-${idx}`}
                style={[styles.tag, { backgroundColor: colors.tagBg }]}
              >
                <Text style={[styles.tagText, { color: colors.tagText }]}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {showFavorite && (
          <Pressable
            onPress={() => toggle(site)}
            hitSlop={12}
            style={styles.starBtn}
          >
            <Ionicons
              name={fav ? "star" : "star-outline"}
              size={22}
              color={fav ? colors.starActive : colors.starInactive}
            />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  logoText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  externalBtn: {
    marginLeft: 6,
    padding: 2,
  },
  desc: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  starBtn: {
    marginLeft: 8,
    marginTop: 2,
  },
});
