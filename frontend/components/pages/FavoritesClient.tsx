"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFavorites } from "../../lib/favorites";
import { useSiteIds } from "../../lib/api";
import SiteCard from "../SiteCard";
import EmptyState from "../EmptyState";
import BackToTopButton from "../BackToTopButton";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function FavoritesClient() {
  const { t, i18n } = useTranslation();
  const { loaded, favoriteSites, pruneMissing } = useFavorites();
  const { data: siteIds } = useSiteIds();

  useEffect(() => {
    if (siteIds && siteIds.length) {
      pruneMissing(siteIds);
    }
  }, [siteIds, pruneMissing]);

  useEffect(() => {
    document.title = t("我的收藏");
  }, [i18n.language, t]);

  const { showButton } = useScrollToTop({ threshold: 200 });

  return (
    <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh", paddingBottom: 80 }}>
      {!loaded ? (
        <div
          className="fn-flex fn-items-center fn-justify-center"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
            paddingBottom: 80,
            paddingLeft: 20,
            paddingRight: 20,
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: "50%", borderWidth: 3, borderStyle: "solid", borderColor: "rgba(79, 70, 229, 0.27)", borderTopColor: "var(--fn-primary)", animation: "fn-spin 0.8s linear infinite" }} />
        </div>
      ) : favoriteSites.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title={t("还没有收藏")}
          message={t("浏览站点时点击星标，即可添加到收藏")}
        />
      ) : (
        <div style={{ maxWidth: 720, margin: "0 auto", paddingLeft: 20, paddingRight: 20, paddingTop: 12 }}>
          {favoriteSites.map((site) => (
            <SiteCard key={String(site.id)} site={site} showFavorite />
          ))}
        </div>
      )}
      {showButton && <BackToTopButton threshold={200} />}
    </div>
  );
}