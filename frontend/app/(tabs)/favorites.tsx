import React, { useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import { useFavorites } from "../../lib/favorites";
import { useSiteIds } from "../../lib/api";
import { useThemeColors } from "../../constants/colors";
import SiteCard from "../../components/SiteCard";
import EmptyState from "../../components/EmptyState";
import PageHero from "../../components/PageHero";
import BackToTopButton, {
  type BackToTopHandle,
} from "../../components/BackToTopButton";

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { loaded, favoriteSites, pruneMissing } = useFavorites();
  const { data: siteIds } = useSiteIds();
  const scrollRef = useRef<FlatList | null>(null);
  const backToTopRef = useRef<BackToTopHandle>(null);

  const handleFlatListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      backToTopRef.current?.handleScroll(e);
    },
    [],
  );

  // 站点被后台删除后，从本地收藏中同步剔除
  useEffect(() => {
    if (siteIds && siteIds.length) {
      pruneMissing(siteIds);
    }
  }, [siteIds, pruneMissing]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top + 16 }}>
        <PageHero title={t("我的收藏")} />
      </View>

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : favoriteSites.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title={t("还没有收藏")}
          message={t("浏览站点时点击星标，即可添加到收藏")}
        />
      ) : (
        <FlatList
          ref={scrollRef}
          data={favoriteSites}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <SiteCard site={item} showFavorite />}
          onScroll={handleFlatListScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.list,
            { paddingTop: 12, paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
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
  list: {
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
