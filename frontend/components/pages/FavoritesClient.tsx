"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFavorites } from "../../lib/favorites";
import { useSiteIds } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import { View, Text, ScrollView, ActivityIndicator } from "../../components/ui/primitives";
import SiteCard from "../SiteCard";
import EmptyState from "../EmptyState";
import PageHero from "../PageHero";
import BackToTopButton from "../BackToTopButton";
import { centeredContent } from "../../constants/layout";
import { useScrollToTop } from "../../lib/hooks/useScrollToTop";

export default function FavoritesClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { loaded, favoriteSites, pruneMissing } = useFavorites();
  const { data: siteIds } = useSiteIds();

  useEffect(() => {
    if (siteIds && siteIds.length) {
      pruneMissing(siteIds);
    }
  }, [siteIds, pruneMissing]);

  const { ref: scrollRef, showButton } = useScrollToTop({ threshold: 200 });

  return (
    <div style={{ backgroundColor: colors.background, minHeight: "100vh" }}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}>
        <div style={{ paddingTop: 16 }}>
          <PageHero title={t("我的收藏")} />
        </div>

        {!loaded ? (
          <div style={{ ...centeredContent.container, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh", paddingBottom: 80 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </div>
        ) : favoriteSites.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title={t("还没有收藏")}
            message={t("浏览站点时点击星标，即可添加到收藏")}
          />
        ) : (
          <div style={{ ...centeredContent.container, paddingLeft: 20, paddingRight: 20, paddingTop: 12 }}>
            {favoriteSites.map((site) => (
              <SiteCard key={String(site.id)} site={site} showFavorite />
            ))}
          </div>
        )}
        {showButton && <BackToTopButton scrollRef={scrollRef} threshold={200} />}
      </ScrollView>
    </div>
  );
}