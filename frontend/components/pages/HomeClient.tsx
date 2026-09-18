"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useCategories, useSitesInfinite, useSettings } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import { View, Text, ScrollView, ActivityIndicator } from "../../components/ui/primitives";
import CategoryChips from "../CategoryChips";
import SiteCard from "../SiteCard";
import SkeletonCard from "../SkeletonCard";
import ErrorState from "../ErrorState";
import EmptyState from "../EmptyState";
import BackToTopButton from "../BackToTopButton";
import { Logo } from "../Logo";
import SeoHeading from "../SeoHeading";
import SiteFooter from "../SiteFooter";
import { centeredContent } from "../../constants/layout";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function HomeClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const searchParams = useSearchParams();
  const selectedSlug = searchParams.get("category");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: categories, isLoading: catLoading, error: catError, refetch: refetchCats } = useCategories();
  const { data: settings } = useSettings();

  const {
    data: sitePages,
    isLoading: sitesLoading,
    error: sitesError,
    refetch: refetchSites,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useSitesInfinite(selectedSlug ? { category: selectedSlug } : undefined);

  const sites = useMemo(
    () => (sitePages?.pages ?? []).flatMap((p) => p.results),
    [sitePages],
  );

  const handleSelect = useCallback(
    (slug: string | null) => {
      const params = new URLSearchParams(searchParams);
      if (slug) params.set("category", slug);
      else params.delete("category");
      window.location.search = params.toString();
    },
    [searchParams],
  );

  const loading = catLoading || sitesLoading;
  const error = catError || sitesError;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { ref: scrollRef, showButton } = useScrollToTop({ threshold: 200 });

  const header = useMemo(
    () => (
      <View style={{ paddingLeft: 20, paddingRight: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <View style={{ width: 48, height: 48, marginBottom: 12 }}>
          <Logo uri={settings?.logo ?? null} size={48} />
        </View>
        <SeoHeading level={1} style={{ fontSize: 26, fontWeight: 700, letterSpacing: 0.3, textAlign: "center", color: colors.text }}>
          {settings?.site_title || t("探索好站")}
        </SeoHeading>
        <Text style={{ fontSize: 14, marginTop: 8, textAlign: "center", color: colors.textSecondary }}>
          {settings?.site_subtitle || t("发现优质的金融与 Web3 工具")}
        </Text>
        <div style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 18, width: "100%" }}>
          {categories && <CategoryChips categories={categories} selected={selectedSlug} onSelect={handleSelect} />}
        </div>
      </View>
    ),
    [colors, categories, selectedSlug, handleSelect, settings, t],
  );

  if (loading) {
    return (
      <div style={{ paddingTop: 16, backgroundColor: colors.background, minHeight: "100vh" }}>
        <ScrollView
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}>
          {header}
          <div style={{ ...centeredContent.container, display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        </ScrollView>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ paddingTop: 16, backgroundColor: colors.background, minHeight: "100vh" }}>
        <ScrollView
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}>
          {header}
          <ErrorState
            message={error.message || t("加载失败")}
            onRetry={() => {
              refetchCats();
              refetchSites();
            }}
          />
        </ScrollView>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh" }}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}>
        {header}
        <div style={{ ...centeredContent.container, paddingLeft: 20, paddingRight: 20, paddingTop: 12 }}>
          {sites.map((site) => (
            <SiteCard key={String(site.id)} site={site} />
          ))}
          <div ref={sentinelRef} style={{ height: 20 }} />
          {isFetchingNextPage && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 16, paddingBottom: 16, gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  borderWidth: 3,
                  borderStyle: "solid",
                  borderColor: `${colors.primary}44`,
                  borderTopColor: colors.primary,
                  animation: "fn-spin 0.8s linear infinite",
                }}
              />
              <Text style={{ fontSize: 12, color: colors.textTertiary }}>{t("加载中…")}</Text>
              <style>{`@keyframes fn-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {!isFetchingNextPage && <SiteFooter showNav={true} />}
        </div>
        {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      </ScrollView>
    </div>
  );
}