import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import { useSiteReviews, useSiteDetail, useSettings } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth";
import type { CaptchaPayload } from "../../../../lib/auth";
import { useThemeColors } from "../../../../constants/colors";
import type { SiteReview } from "../../../../lib/types";
import AuthModal from "../../../../components/AuthModal";
import ErrorState from "../../../../components/ErrorState";
import SeoHeading from "../../../../components/SeoHeading";
import { usePageSeo, canonicalFromPath } from "../../../../lib/seo";
import { reviewsTitle, reviewsDescription } from "../../../../lib/seoCopy";
import { centeredContent } from "../../../../constants/layout";

function ReviewStars({ score, colors, size = 12 }: { score: number; colors: any; size?: number }) {
  return (
    <View style={styles.reviewStars}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = score >= i;
        const halfFilled = !filled && score >= i - 0.5;
        if (halfFilled) {
          return (
            <View
              key={i}
              style={[styles.halfStarContainer, { width: size, height: size }]}
            >
              <Ionicons name="star-outline" size={size} color={colors.textTertiary} />
              <View
                style={[
                  styles.halfStarOverlay,
                  { width: size / 2, height: size },
                ]}
              >
                <Ionicons name="star" size={size} color={colors.starActive} />
              </View>
            </View>
          );
        }
        return (
          <Ionicons
            key={i}
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? colors.starActive : colors.textTertiary}
          />
        );
      })}
    </View>
  );
}

function ReviewItem({ review, colors }: { review: SiteReview; colors: any }) {
  return (
    <View style={[styles.reviewItem, { borderColor: colors.border }]}>
      <View style={styles.reviewHeader}>
        <Text style={[styles.reviewUser, { color: colors.textSecondary }]}>
          {review.username_masked}
        </Text>
        <ReviewStars score={review.score} colors={colors} />
      </View>
      {review.comment ? (
        <Text style={[styles.reviewComment, { color: colors.text }]}>
          {review.comment}
        </Text>
      ) : null}
    </View>
  );
}

export default function SiteReviewsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);

  const [authVisible, setAuthVisible] = useState(false);

  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSiteReviews(siteId, true);

  const reviews = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.results),
    [data],
  );
  const totalCount = data?.pages[0]?.count ?? 0;

  const { data: site } = useSiteDetail(siteId);
  const { data: settings } = useSettings();
  // 子页 SEO：标题代入站点名，canonical 固定到标准路径。
  usePageSeo({
    title: site ? reviewsTitle(t, settings, site.name) : undefined,
    description: site ? reviewsDescription(t, site.name, totalCount) : undefined,
    canonical: Number.isFinite(siteId) && siteId > 0 ? canonicalFromPath(`/site/${siteId}/reviews`) : undefined,
  });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/site/${siteId}`);
    }
  };

  const handleLogin = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      return auth.login(email, password, captcha);
    },
    [auth],
  );

  const handleLoginTFA = useCallback(
    async (email: string, totpToken: string, code: string) => {
      await auth.loginTFA(email, totpToken, code);
    },
    [auth],
  );

  const handleRegister = useCallback(
    async (email: string, password: string, captcha: CaptchaPayload) => {
      return auth.register(email, password, captcha);
    },
    [auth],
  );

  const handleVerify = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.verify(email, code, password);
    },
    [auth],
  );

  const handleRequestReset = useCallback(
    async (email: string) => {
      await auth.requestPasswordReset(email);
    },
    [auth],
  );

  const handleResetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      await auth.resetPassword(email, code, password);
    },
    [auth],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 52 }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <SeoHeading level={1} style={[styles.title, { color: colors.text }]}>
          {t("大家的评价")}
        </SeoHeading>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <ErrorState
          message={error.message || t("加载失败")}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ReviewItem review={item} colors={colors} />}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <View>
              <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
                {t("共 {{count}} 条评价", { count: totalCount })}
              </Text>
              {!loggedIn ? (
                <Pressable
                  onPress={() => setAuthVisible(true)}
                  style={({ pressed }) => [
                    styles.loginBanner,
                    {
                      backgroundColor: colors.chipBg,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View style={styles.loginBannerInner}>
                    <Ionicons name="log-in-outline" size={16} color={colors.primary} />
                    <Text style={[styles.loginBannerText, { color: colors.primary }]}>
                      {t("登录后可查看评价内容")}
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              {t("暂无其它评价")}
            </Text>
          }
          contentContainerStyle={[styles.list, centeredContent.container]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={handleLogin}
        onLoginTFA={handleLoginTFA}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onRequestReset={handleRequestReset}
        onResetPassword={handleResetPassword}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  resultCount: {
    fontSize: 12,
    marginBottom: 12,
  },
  reviewItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewUser: {
    fontSize: 13,
    fontWeight: "600",
  },
  reviewComment: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  reviewStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  halfStarContainer: {
    position: "relative",
    overflow: "hidden",
  },
  halfStarOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
  empty: {
    textAlign: "center",
    paddingVertical: 32,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loginBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  loginBannerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
});
