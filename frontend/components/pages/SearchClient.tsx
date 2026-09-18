"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSitesInfinite, useCategories, useSettings } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import { useSearchHistory } from "../../lib/searchHistory";
import { View, Text, Pressable, ScrollView } from "../../components/ui/primitives";
import { Ionicons } from "../../components/ui/icons";
import CategoryChips from "../CategoryChips";
import SiteCard from "../SiteCard";
import SkeletonCard from "../SkeletonCard";
import ErrorState from "../ErrorState";
import EmptyState from "../EmptyState";
import InternalLink from "../InternalLink";
import PageHero from "../PageHero";
import BackToTopButton from "../BackToTopButton";
import { centeredContent } from "../../constants/layout";
import SiteFooter from "../SiteFooter";
import { SearchBar } from "../../components/ui/antd";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function SearchClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { loaded: historyLoaded, terms: historyTerms, addTerm, removeTerm, clearAll } = useSearchHistory();
  const { data: settings } = useSettings();

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q) return;
    const id = setTimeout(() => {
      addTerm(q);
      setQuery(q);
      setDebouncedQuery(q);
      if (timerRef.current) clearTimeout(timerRef.current);
    }, 0);
    return () => clearTimeout(id);
  }, [searchParams.get("q"), addTerm]);

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

  const sites = useMemo(() => (sitePages?.pages ?? []).flatMap((p) => p.results), [sitePages]);
  const totalCount = sitePages?.pages[0]?.count ?? 0;

  const { data: categories } = useCategories();

  const hotTerms = useMemo(() => {
    const fromCats = (categories ?? []).filter((c) => c.name).map((c) => c.name);
    const common = [t("钱包"), t("交易所"), t("教程"), t("下载")];
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

  const { ref: scrollRef, showButton } = useScrollToTop({ threshold: 200 });

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh" }}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}>
        <div style={{ paddingTop: 16 }}>
          <PageHero title={t("搜索站点")} />
          <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 14 }}>
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
              style={{ borderRadius: 10 }}
            />
          </div>
        </div>

        {isLoading && showResults ? (
          <div style={{ ...centeredContent.container, display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}>
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error.message || t("搜索失败")} onRetry={() => refetch()} />
        ) : !showResults ? (
          <div style={{ ...centeredContent.container, paddingBottom: 80 }}>
            {historyLoaded && historyTerms.length > 0 ? (
              <div style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 24 }}>
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>{t("搜索历史")}</Text>
                  <Pressable onPress={clearAll} style={{ padding: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.textTertiary }}>{t("清空")}</Text>
                  </Pressable>
                </div>
                <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {historyTerms.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleSelectTerm(term)}
                      style={{
                        paddingLeft: 14, paddingRight: 14,
                        paddingTop: 8, paddingBottom: 8,
                        borderWidth: 1,
                        borderRadius: 999,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: colors.text }}>{term}</Text>
                    </Pressable>
                  ))}
                </div>
              </div>
            ) : null}

            {hotTerms.length > 0 ? (
              <div style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 24 }}>
                <Text style={{ fontSize: 13, color: colors.textTertiary }}>{t("热门搜索")}</Text>
                <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                  {hotTerms.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleSelectTerm(term)}
                      style={{
                        paddingLeft: 14, paddingRight: 14,
                        paddingTop: 8, paddingBottom: 8,
                        borderWidth: 1,
                        borderRadius: 999,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: colors.primary }}>{term}</Text>
                    </Pressable>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon="search-outline" title={t("搜索你需要的站点")} message={t("输入关键词查找金融和 Web3 工具")} />
            )}

            <InternalLink href="/" style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 6, paddingLeft: 20, paddingRight: 20 }}>
              <Text style={{ color: colors.primary, fontSize: 15 }}>← {t("返回首页")}</Text>
            </InternalLink>

            <SiteFooter showNav={false} />
          </div>
        ) : sites && sites.length > 0 ? (
          <div style={{ ...centeredContent.container, paddingLeft: 20, paddingRight: 20, paddingTop: 16 }}>
            <Text style={{ fontSize: 12, marginBottom: 8, color: colors.textTertiary }}>{t("找到 {{count}} 个结果", { count: totalCount })}</Text>
            {sites.map((site) => (
              <SiteCard key={String(site.id)} site={site} />
            ))}
            <div ref={(el) => { if (el) el.id = "sentinel"; }} style={{ height: 20 }} />
            {isFetchingNextPage ? (
              <Text style={{ textAlign: "center", paddingTop: 16, paddingBottom: 16, color: colors.textTertiary }}>{t("加载中…")}</Text>
            ) : (
              <SiteFooter showNav={false} />
            )}
          </div>
        ) : (
          <EmptyState icon="search-outline" title={t("没有找到相关站点")} message={t("换个关键词试试？")} />
        )}
        {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      </ScrollView>
    </div>
  );
}