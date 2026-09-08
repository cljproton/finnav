import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Logo } from "../components/Logo";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import type { Site } from "../lib/types";
import { useFavorites } from "../lib/favorites";
import { useThemeColors } from "../constants/colors";
import ExternalLink from "./ExternalLink";



interface SiteCardProps {
  site: Site;
  showFavorite?: boolean;
}

export default function SiteCard({ site, showFavorite = true }: SiteCardProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(site.id);
  const router = useRouter();
  const pathname = usePathname();

  // 记录来源列表页，返回时导航回对应 tab（而非依赖可能残留的栈历史）
  const from = pathname.startsWith("/search")
    ? "/search"
    : pathname.startsWith("/favorites")
      ? "/favorites"
      : "/";

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
      onPress={() => router.replace({ pathname: `/site/${site.id}`, params: { from } })}
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
            <ExternalLink
              url={site.url}
              style={styles.externalBtn}
              accessibilityLabel={t("打开 {{name}}", { name: site.name })}
            >
              <Ionicons
                name="open-outline"
                size={13}
                color={colors.textTertiary}
              />
            </ExternalLink>
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
            accessibilityRole="button"
            accessibilityLabel={fav ? t("取消收藏") : t("收藏站点")}
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
    alignItems: "center",
    gap: 12,
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
    padding: 6,
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
  },
});
