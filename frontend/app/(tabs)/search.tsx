import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import SearchBar from "@ant-design/react-native/es/search-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { useSitesInfinite, useCategories } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import { useSearchHistory } from "../../lib/searchHistory";
import SiteCard from "../../components/SiteCard";
import SkeletonCard from "../../components/SkeletonCard";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import PageHero from "../../components/PageHero";
import BackToTopButton, {
  type BackToTopHandle,
} from "../../components/BackToTopButton";

export default function SearchScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<FlatList | null>(null);
  const backToTopRef = useRef<BackToTopHandle>(null);

  const handleFlatListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      backToTopRef.current?.handleScroll(e);
    },
    [],
  );
  const { loaded: historyLoaded, terms: historyTerms, addTerm, removeTerm, clearAll } =
    useSearchHistory();

  // 支持从其它页面带 q 跳入（如详情页点击标签）：同步到输入框并立即搜索。
  useEffect(() => {
    const q = params.q?.trim();
    if (!q) return;
    addTerm(q);
    setQuery(q);
    setDebouncedQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [params.q, addTerm]);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 400);
  }, []);

  const {
    data: sitePages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSitesInfinite(
    debouncedQuery.trim() ? { q: debouncedQuery.trim() } : undefined,
  );

  const sites = useMemo(
    () => (sitePages?.pages ?? []).flatMap((p) => p.results),
    [sitePages],
  );
  const totalCount = sitePages?.pages[0]?.count ?? 0;

  const { data: categories } = useCategories();

  const hotTerms = useMemo(() => {
    const fromCats = (categories ?? [])
      .filter((c) => c.name)
      .map((c) => c.name);
    const common = [t("钱包"), t("交易所"), t("教程"), t("下载")];
    // 去重并保持顺序
    return Array.from(new Set([...common, ...fromCats]));
  }, [categories, t]);

  const handleSelectTerm = useCallback(
    (term: string) => {
      addTerm(term);
      setQuery(term);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedQuery(term);
      }, 0);
    },
    [addTerm],
  );

  const showResults = debouncedQuery.trim().length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top + 16 }}>
        <PageHero title={t("搜索站点")} />

        {/* AntD SearchBar */}
        <View style={styles.searchBarWrap}>
          <SearchBar
            value={query}
            onChange={handleChange}
            onSubmit={() => {
              const t = query.trim();
              if (t) {
                addTerm(t);
                if (debouncedQuery !== t) {
                  setDebouncedQuery(t);
                }
              }
            }}
            placeholder={t("输入名称、描述或标签...")}
            showCancelButton={false}
            style={styles.searchBar}
          />
        </View>
      </View>

      {isLoading && showResults ? (
        <View style={styles.list}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : error ? (
        <ErrorState
          message={error.message || t("搜索失败")}
          onRetry={() => refetch()}
        />
      ) : !showResults ? (
        <View>
          {historyLoaded && historyTerms.length > 0 ? (
            <View style={styles.hot}>
              <View style={styles.hotHeader}>
                <Text style={[styles.hotLabel, { color: colors.textTertiary }]}>
                  {t("搜索历史")}
                </Text>
                <Pressable onPress={clearAll} hitSlop={8}>
                  <Text style={[styles.clearText, { color: colors.textTertiary }]}>
                    {t("清空")}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.hotChips}>
                {historyTerms.map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => handleSelectTerm(term)}
                    style={[
                      styles.hotChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.hotChipText, { color: colors.text }]}>
                      {term}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {hotTerms.length > 0 ? (
            <View style={styles.hot}>
              <Text style={[styles.hotLabel, { color: colors.textTertiary }]}>
                {t("热门搜索")}
              </Text>
              <View style={styles.hotChips}>
                {hotTerms.map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => handleSelectTerm(term)}
                    style={[
                      styles.hotChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.hotChipText, { color: colors.primary }]}>
                      {term}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <EmptyState
              icon="search-outline"
              title={t("搜索你需要的站点")}
              message={t("输入关键词查找金融和 Web3 工具")}
            />
          )}
        </View>
      ) : sites && sites.length > 0 ? (
        <FlatList
          ref={scrollRef}
          data={sites}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <SiteCard site={item} />}
          onScroll={handleFlatListScroll}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
                {t("加载中…")}
              </Text>
            ) : null
          }
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
              {t("找到 {{count}} 个结果", { count: totalCount })}
            </Text>
          }
        />
      ) : (
        <EmptyState
          icon="search-outline"
          title={t("没有找到相关站点")}
          message={t("换个关键词试试？")}
        />
      )}
      <BackToTopButton scrollRef={scrollRef} ref={backToTopRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBarWrap: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  searchBar: {
    borderRadius: 10,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  resultCount: {
    fontSize: 12,
    marginBottom: 8,
  },
  hot: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  hotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  hotLabel: {
    fontSize: 13,
  },
  clearText: {
    fontSize: 12,
  },
  hotChips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  hotChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 999,
  },
  hotChipText: {
    fontSize: 13,
  },
});
