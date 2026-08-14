import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCategories, useSitesInfinite, useSettings } from "../../lib/api";import { useThemeColors } from "../../constants/colors";
import CategoryChips from "../../components/CategoryChips";
import SiteCard from "../../components/SiteCard";
import SkeletonCard from "../../components/SkeletonCard";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import BackToTopButton, {
  type BackToTopHandle,
} from "../../components/BackToTopButton";
import { Logo } from "../../components/Logo";

export default function HomeScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // 选中的分类 slug 写入 URL 参数（?category=xxx），返回详情页后退回首页仍能恢复该分类。
  const params = useLocalSearchParams<{ category?: string }>();
  const selectedSlug = params.category ? String(params.category) : null;
  const scrollRef = useRef<FlatList | null>(null);
  const backToTopRef = useRef<BackToTopHandle>(null);

  const handleFlatListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      backToTopRef.current?.handleScroll(e);
    },
    [],
  );

  const {
    data: categories,
    isLoading: catLoading,
    error: catError,
    refetch: refetchCats,
  } = useCategories();

  const { data: settings } = useSettings();

  const {
    data: sitePages,
    isLoading: sitesLoading,
    error: sitesError,
    refetch: refetchSites,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSitesInfinite(selectedSlug ? { category: selectedSlug } : undefined);

  const sites = useMemo(
    () => (sitePages?.pages ?? []).flatMap((p) => p.results),
    [sitePages],
  );

  const handleSelect = useCallback(
    (slug: string | null) => {
      // 同步到 URL：切分类/返回站点详情后退回时，首页保持当前分类。
      // undefined 用于清除 ?category= 参数，回到“全部”。
      router.setParams(slug ? { category: slug } : { category: undefined });
    },
    [router],
  );

  const loading = catLoading || sitesLoading;
  const error = catError || sitesError;

  const header = useMemo(
    () => (
      <View>
        {/* Hero title area */}
        <View style={styles.heroSection}>
          <Logo uri={settings?.logo ?? null} size={64} />
          <Text style={[styles.greeting, { color: colors.text }]}>
            {settings?.site_title || t("探索好站")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {settings?.site_subtitle || t("发现优质的金融与 Web3 工具")}
          </Text>
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          style={styles.chipsContainer}
        >
          {categories && (
            <CategoryChips
              categories={categories}
              selected={selectedSlug}
              onSelect={handleSelect}
            />
          )}
        </ScrollView>
      </View>
    ),
    [colors, categories, selectedSlug, handleSelect, settings, t],
  );

  if (loading) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top + 16 },
        ]}
      >
        {header}
        <View style={styles.list}>
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top + 16 },
        ]}
      >
        {header}
        <ErrorState
          message={error.message || t("加载失败")}
          onRetry={() => {
            refetchCats();
            refetchSites();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        ref={scrollRef}
        data={sites}
        keyExtractor={(item) => String(item.id)}
        onScroll={handleFlatListScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => <SiteCard site={item} />}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadMore}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.loadMoreText, { color: colors.textTertiary }]}>
                {t("加载中…")}
              </Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + 16 }}>{header}</View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={t("暂无站点")}
            message={
              selectedSlug
                ? t("当前分类下没有站点，换个分类看看")
                : t("还没有收录任何站点")
            }
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 20 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetchSites()}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
      <BackToTopButton scrollRef={scrollRef} ref={backToTopRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  chipsContainer: {
    marginTop: 18,
  },
  chipsScroll: {
    paddingLeft: 20,
    paddingRight: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  loadMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 12,
  },
});
