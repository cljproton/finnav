"use client";

import { useTranslation } from "react-i18next";
import type { SitePage, SiteSettings } from "../../lib/types";
import SiteCard from "../SiteCard";
import EmptyState from "../EmptyState";
import InternalLink from "../InternalLink";

export default function SitesIndexClient({
  settings,
  sitePage,
  page,
}: {
  settings: SiteSettings | null;
  sitePage: SitePage | null;
  page: number;
}) {
  const { t } = useTranslation();
  const perPage = settings?.sites_per_page || sitePage?.results.length || 20;
  const totalCount = sitePage?.count ?? 0;
  const totalPages = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / perPage)) : 1;
  const sites = sitePage?.results ?? [];

  const makePageUrl = (n: number) => (n <= 1 ? "/sites" : `/sites?page=${n}`);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).slice(
    Math.max(0, page - 4),
    page + 3,
  );

  return (
    <div className="fn-min-h-screen" style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div className="fn-p-5" style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
        <div className="fn-mb-3" style={{ marginBottom: 12 }}>
          <h1 className="fn-text-xl fn-font-bold fn-text-primary" style={{ fontSize: 20, fontWeight: 700, color: "var(--fn-text)" }}>
            {t("全部站点")}
          </h1>
          {totalCount > 0 ? (
            <span className="fn-text-sm fn-text-tertiary" style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>
              {t("共 {{count}} 个站点", { count: totalCount })}
            </span>
          ) : null}
        </div>

        {sites.length > 0 ? (
          <div className="fn-site-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {sites.map((site) => (
              <SiteCard key={String(site.id)} site={site} />
            ))}
          </div>
        ) : (
          <EmptyState icon="sad-outline" title={t("暂无可展示站点")} />
        )}

        {totalPages > 1 ? (
          <nav
            aria-label="分页"
            className="fn-flex fn-items-center fn-justify-center fn-flex-wrap"
            style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 16 }}
          >
            {page > 1 ? (
              <InternalLink
                href={makePageUrl(page - 1)}
                className="fn-px-3 fn-py-1 fn-rounded-full fn-border-default fn-bg-surface"
                style={{ paddingInline: 12, paddingTop: 4, paddingBottom: 4, borderRadius: "var(--fn-radius-full)", borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)" }}
              >
                {t("上一页")}
              </InternalLink>
            ) : null}
            {pageNumbers.map((n) => (
              <InternalLink
                key={n}
                href={makePageUrl(n)}
                className="fn-px-2.5 fn-py-1 fn-rounded-full"
                style={{
                  paddingInline: 10,
                  paddingTop: 4,
                  paddingBottom: 4,
                  borderRadius: "var(--fn-radius-full)",
                  borderWidth: n === page ? 0 : 1,
                  borderColor: "var(--fn-border)",
                  backgroundColor: n === page ? "var(--fn-primary)" : "var(--fn-surface)",
                  color: n === page ? "#fff" : "inherit",
                }}
              >
                {n}
              </InternalLink>
            ))}
            {page < totalPages ? (
              <InternalLink
                href={makePageUrl(page + 1)}
                className="fn-px-3 fn-py-1 fn-rounded-full fn-border-default fn-bg-surface"
                style={{ paddingInline: 12, paddingTop: 4, paddingBottom: 4, borderRadius: "var(--fn-radius-full)", borderWidth: 1, borderColor: "var(--fn-border)", backgroundColor: "var(--fn-surface)" }}
              >
                {t("下一页")}
              </InternalLink>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}