"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSitesInfinite } from "../../lib/api";
import { useSearchHistory } from "../../lib/searchHistory";
import { Ionicons } from "../../components/ui/icons";
import SiteCard from "../SiteCard";
import SkeletonCard from "../SkeletonCard";
import ErrorState from "../ErrorState";
import EmptyState from "../EmptyState";
import InternalLink from "../InternalLink";
import BackToTopButton from "../BackToTopButton";
import { InputSearch } from "@/components/antd-wrapper";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function SearchClient() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { loaded: historyLoaded, terms: historyTerms, addTerm, removeTerm, clearAll } = useSearchHistory();

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

  const handleSearchChange = useCallback((text: string) => {
    handleChange(text);
  }, [handleChange]);

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

  const handleSubmit = useCallback(() => {
    const t = query.trim();
    if (t) {
      addTerm(t);
      if (debouncedQuery !== t) {
        setDebouncedQuery(t);
      }
    }
  }, [query, debouncedQuery, addTerm]);

  return (
    <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div
        className="fn-flex fn-flex-col fn-overflow-y-auto"
        ref={scrollRef}
        style={{ scrollBehavior: "auto" }}
      >
        {/* Search header */}
        <div className="fn-px-5 fn-py-3 fn-flex fn-items-center fn-justify-between" style={{ paddingInline: 20, paddingTop: 12, paddingBottom: 8, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="fn-p-1 fn-cursor-pointer"
            style={{ padding: 8, cursor: "pointer", border: "none", background: "transparent" }}
            aria-label="返回"
          >
            <Ionicons name="chevron-back" size={24} color="var(--fn-text)" />
          </button>
          <span className="fn-text-xl fn-font-bold fn-text-primary fn-flex-1 fn-text-center" style={{ fontSize: 20, fontWeight: 700, flex: 1, textAlign: "center" }}>搜索</span>
          <div className="fn-w-10" style={{ width: 40 }} />
        </div>

        {/* Search input */}
        <div className="fn-px-5 fn-pt-3.5" style={{ paddingInline: 20, paddingTop: 14 }}>
          <InputSearch
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
            onSearch={handleSubmit}
            placeholder={t("搜索名称、描述或标签...")}
            style={{
              borderRadius: "var(--fn-radius-md)",
              borderWidth: 1,
              borderColor: "var(--fn-border)",
              backgroundColor: "var(--fn-surface)",
              padding: "12px 16px",
              boxShadow: "var(--fn-shadow-xs)",
            }}
            enterButton
          />
        </div>

        {/* Results / Empty / Loading / Error */}
        {isLoading && showResults ? (
          <div className="fn-site-grid fn-p-5" style={{ padding: 20 }}>
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="fn-p-5" style={{ padding: 20 }}>
            <ErrorState message={error.message || t("搜索失败")} onRetry={() => refetch()} />
          </div>
        ) : !showResults ? (
          <div className="fn-pb-20" style={{ paddingBottom: 80 }}>
            <div className="fn-px-5 fn-pt-6" style={{ paddingInline: 20, paddingTop: 24 }}>
              <span className="fn-text-sm fn-text-tertiary fn-mb-3" style={{ fontSize: 13, color: "var(--fn-text-tertiary)", marginBottom: 12 }}>热门搜索</span>
              <div className="fn-pb-1" style={{ display: "flex", flexWrap: "wrap", overflowX: "visible", gap: 8, paddingBottom: 4 }}>
                {["钱包", "交易所", "DeFi", "下载", "教程", "行情", "银行", "券商"].map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleSelectTerm(term)}
                    className="fn-px-3.5 fn-py-2 fn-rounded-full fn-border-default fn-bg-surface fn-transition-fast fn-cursor-pointer"
                    style={{
                      paddingInline: 14,
                      paddingRight: 14,
                      paddingTop: 8,
                      paddingBottom: 8,
                      borderWidth: 1,
                      borderRadius: "var(--fn-radius-full)",
                      backgroundColor: "var(--fn-surface)",
                      borderColor: "var(--fn-border)",
                      transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <span className="fn-text-sm fn-text-brand" style={{ fontSize: 13, color: "var(--fn-primary)" }}>{term}</span>
                  </button>
                ))}
              </div>
            </div>
            {historyLoaded && historyTerms.length > 0 ? (
<div className="fn-px-5 fn-pt-6" style={{ paddingInline: 20, paddingTop: 24 }}>
                <div className="fn-flex fn-items-center fn-justify-between fn-mb-3" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 13, color: "var(--fn-text-tertiary)" }}>搜索历史</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="fn-p-1 fn-cursor-pointer"
                    style={{ padding: 8 }}
                  >
                    <span className="fn-text-xs fn-text-tertiary" style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>清空</span>
                  </button>
                </div>
                <div className="fn-pb-1" style={{ display: "flex", flexWrap: "wrap", overflowX: "visible", gap: 8, paddingBottom: 4 }}>
                  {historyTerms.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleSelectTerm(term)}
                      className="fn-px-3.5 fn-py-2 fn-rounded-full fn-border-default fn-bg-surface fn-transition-fast fn-cursor-pointer"
                      style={{
                        paddingInline: 14,
                        paddingRight: 14,
                        paddingTop: 8,
                        paddingBottom: 8,
                        borderWidth: 1,
                        borderRadius: "var(--fn-radius-full)",
                        backgroundColor: "var(--fn-surface)",
                        borderColor: "var(--fn-border)",
                        transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    >
                      <span className="fn-text-sm fn-text-primary" style={{ fontSize: 13, color: "var(--fn-text)" }}>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <InternalLink href="/" className="fn-flex fn-flex-row fn-items-center fn-justify-center fn-mt-1.5 fn-px-5 fn-pt-4" style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 6, paddingLeft: 20, paddingRight: 20, paddingTop: 16 }}>
              <Ionicons name="chevron-back" size={16} color="var(--fn-primary)" />
              <span className="fn-text-md fn-text-brand fn-ml-1" style={{ color: "var(--fn-primary)", fontSize: 15, marginLeft: 4 }}>返回首页</span>
            </InternalLink>
          </div>
        ) : sites && sites.length > 0 ? (
          <div className="fn-site-grid fn-p-5" style={{ padding: 20 }}>
            <div className="fn-col-span-full fn-mb-2" style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
              <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>{t("找到 {{count}} 个结果", { count: totalCount })}</span>
            </div>
            {sites.map((site) => (
              <SiteCard key={String(site.id)} site={site} />
            ))}
            <div className="fn-h-5 fn-col-span-full" style={{ height: 20, gridColumn: "1 / -1" }} />
            {isFetchingNextPage ? (
              <span className="fn-text-center fn-py-4 fn-col-span-full fn-text-tertiary" style={{ textAlign: "center", paddingTop: 16, paddingBottom: 16, color: "var(--fn-text-tertiary)", gridColumn: "1 / -1" }}>加载中…</span>
            ) : null}
          </div>
        ) : (
          <EmptyState icon="search-outline" title={t("没有找到相关站点")} message={t("换个关键词试试？")} />
        )}
        {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      </div>
    </div>
  );
}