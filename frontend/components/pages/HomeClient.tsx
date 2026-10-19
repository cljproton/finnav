"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useCategories, useSitesInfinite } from "../../lib/api";
import CategoryChips from "../CategoryChips";
import { ClientOnly } from "../ClientOnly";
import SiteCard from "../SiteCard";
import SkeletonCard from "../SkeletonCard";
import ErrorState from "../ErrorState";
import EmptyState from "../EmptyState";
import BackToTopButton from "../BackToTopButton";
import { Logo } from "../Logo";
import SeoHeading from "../SeoHeading";
import { Ionicons } from "../../components/ui/icons";
import InternalLink from "../InternalLink";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";
import type { Category, SitePage, SiteSettings } from "../../lib/types";

export default function HomeClient({
  settings,
  initialSitePage,
  initialCategories,
}: {
  settings?: SiteSettings | null;
  initialSitePage?: SitePage;
  initialCategories?: Category[];
}) {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedSlug = searchParams.get("category");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: categories, isLoading: catLoading, error: catError, refetch: refetchCats } = useCategories(initialCategories);

  const {
    data: sitePages,
    isLoading: sitesLoading,
    error: sitesError,
    refetch: refetchSites,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useSitesInfinite(
    selectedSlug ? { category: selectedSlug } : undefined,
    selectedSlug ? undefined : initialSitePage,
  );

  const sites = useMemo(
    () => (sitePages?.pages ?? []).flatMap((p) => p.results),
    [sitePages],
  );

  const handleSelect = useCallback(
    (slug: string | null) => {
      const params = new URLSearchParams(searchParams);
      if (slug) params.set("category", slug);
      else params.delete("category");
      const qs = params.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      if (target === `${pathname}?${searchParams.toString()}`) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      router.replace(target, { scroll: false });
    },
    [searchParams, pathname, router],
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

  // 首页可见 H1：服务端渲染（文案来自后台副标题），补上原缺失的标题层级。
  const pageHeading = (
    <div
      className="fn-px-5"
      style={{
        paddingInline: 20,
        paddingTop: 8,
        paddingBottom: 4,
        maxWidth: 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <SeoHeading
        level={1}
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.35,
          color: "var(--fn-text)",
          textAlign: "center",
        }}
      >
        {(settings?.site_subtitle || "").trim() || t("金融与 Web3 站点导航")}
      </SeoHeading>
    </div>
  );

  // Hero section (only on all-sites view, not filtered)
  const hero = useMemo(
    () =>
      !selectedSlug ? (
        <div className="fn-hero fn-px-5" style={{ paddingInline: 20, paddingTop: 8, paddingBottom: 8 }}>
          <div className="fn-flex fn-gap-2" style={{ display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
            <button
              type="button"
              onClick={() => window.location.href = "/search"}
              className="fn-search-trigger fn-flex fn-items-center fn-gap-2 fn-rounded-full fn-transition-fast fn-w-full"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 16px",
                height: 46,
                borderRadius: "var(--fn-radius-full)",
                transition: "all var(--fn-duration-fast) var(--fn-ease-out)",
              }}
            >
              <Ionicons name="search" size={18} color="var(--fn-text-tertiary)" />
              <span className="fn-flex-1 fn-text-md fn-text-tertiary" style={{ flex: 1, fontSize: 15, textAlign: "left" }}>
                {t("搜索站点、教程、经验...")}
              </span>
              <Ionicons name="chevron-forward" size={16} color="var(--fn-text-tertiary)" />
            </button>
          </div>
        </div>
      ) : null,
    [selectedSlug, t, i18n.language],
  );

  // Sticky category chips
  const categorySection = useMemo(
    () => (
      <div className="fn-sticky fn-top-14 fn-z-50 fn-pb-2 fn-border-b" style={{ position: "sticky", top: 56, zIndex: 50, backgroundColor: "var(--fn-bg)", paddingBottom: 8, borderBottom: "1px solid var(--fn-divider)" }}>
        <div className="fn-px-5 fn-py-3" style={{ paddingInline: 20, paddingTop: 12, width: "100%" }}>
          <ClientOnly>
            <CategoryChips categories={categories ?? []} selected={selectedSlug} onSelect={handleSelect} />
          </ClientOnly>
        </div>
      </div>
    ),
    [categories, selectedSlug, handleSelect],
  );

  // Language switcher moved to AppShell header (top-right)

  if (loading) {
    return (
      <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
        <div
          className="fn-flex fn-flex-col"
          ref={scrollRef}
          style={{ scrollBehavior: "auto" }}
        >
          {pageHeading}
          {hero}
          {categorySection}
          <div className="fn-site-grid fn-p-5" style={{ padding: 20 }}>
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
        <div
          className="fn-flex fn-flex-col"
          ref={scrollRef}
          style={{ scrollBehavior: "auto" }}
        >
          {pageHeading}
          {hero}
          {categorySection}
          <div className="fn-p-5" style={{ padding: 20 }}>
            <ErrorState
              message={error.message || t("加载失败")}
              onRetry={() => {
                refetchCats();
                refetchSites();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div
        className="fn-flex fn-flex-col"
        ref={scrollRef}
        style={{ scrollBehavior: "auto" }}
      >
        {pageHeading}
        {hero}
        {categorySection}
        {selectedSlug ? (
          <div className="fn-px-5 fn-pb-3" style={{ paddingInline: 20, paddingBottom: 12 }}>
            <InternalLink
              href={`/?category=${encodeURIComponent(selectedSlug)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "8px 12px",
                borderRadius: "var(--fn-radius-full)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fn-primary)",
                backgroundColor: "var(--fn-primary-light)",
                border: "1px solid var(--fn-border-glow)",
                textDecoration: "none",
              }}
            >
              查看所有{t("同分类站点")}
              <Ionicons name="chevron-forward" size={14} color="var(--fn-primary)" />
            </InternalLink>
          </div>
        ) : null}
        <div className="fn-site-grid fn-p-5" style={{ padding: 20 }}>
          {sites.map((site) => (
            <SiteCard key={String(site.id)} site={site} />
          ))}
          <div ref={sentinelRef} style={{ height: 20 }} />
          {isFetchingNextPage && (
            <div className="fn-flex fn-items-center fn-justify-center fn-py-4" style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 16, paddingBottom: 16, gap: 8, gridColumn: "1 / -1" }}>
              <div
                className="fn-animate-spin fn-rounded-full fn-border-3 fn-border-brand/27"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  borderWidth: 3,
                  borderStyle: "solid",
                  borderColor: "rgba(79, 70, 229, 0.27)",
                  borderTopColor: "var(--fn-primary)",
                  animation: "fn-spin 0.8s linear infinite",
                }}
              />
              <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>加载中…</span>
              <style>{`@keyframes fn-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          </div>
        {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      </div>
    </div>
  );
}