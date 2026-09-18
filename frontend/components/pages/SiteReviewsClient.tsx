"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "../ui/primitives";
import { Ionicons } from "../ui/icons";
import { useSiteReviews } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import { useThemeColors, type Colors } from "../../constants/colors";
import type { SiteReview } from "../../lib/types";
import AuthModal from "../AuthModal";
import ErrorState from "../ErrorState";
import SeoHeading from "../SeoHeading";
import { centeredContent } from "../../constants/layout";
import { StyleSheet } from "../../lib/rnStyle";

function ReviewStars({ score, colors, size = 12 }: { score: number; colors: Colors; size?: number }) {
  return (
    <View style={styles.reviewStars}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = score >= i;
        const halfFilled = !filled && score >= i - 0.5;
        if (halfFilled) {
          return (
            <View key={i} style={[styles.halfStarContainer, { width: size, height: size }]}>
              <Ionicons name="star-outline" size={size} color={colors.textTertiary} />
              <View style={[styles.halfStarOverlay, { width: size / 2, height: size }]}>
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

function ReviewItem({ review, colors }: { review: SiteReview; colors: Colors }) {
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

export default function SiteReviewsClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const params = useParams<{ id: string }>();
  const siteId = Number(params?.id);

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

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
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

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
      if (nearBottom && hasNextPage && !isFetchingNextPage && !isLoading && !error) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, isLoading, error, fetchNextPage],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: 12 }]}>
        <Pressable onPress={goBack} style={styles.backBtn} accessibilityLabel={t("返回")}>
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
        <ErrorState message={error.message || t("加载失败")} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.list, centeredContent.container]}
          onScroll={handleScroll}
        >
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
              accessibilityRole="button"
              accessibilityLabel={t("登录后可查看评价内容")}
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

          {reviews.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              {t("暂无其它评价")}
            </Text>
          ) : (
            reviews.map((item) => <ReviewItem key={item.id} review={item} colors={colors} />)
          )}

          {isFetchingNextPage ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
        </ScrollView>
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
  screen: { flex: 1, minHeight: "100vh" },
  scroll: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  title: { fontSize: 17, fontWeight: "700" },
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
  resultCount: { fontSize: 12, marginBottom: 12 },
  reviewItem: { paddingVertical: 12, borderBottomWidth: 1 },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reviewUser: { fontSize: 13, fontWeight: "600" },
  reviewComment: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  reviewStars: { flexDirection: "row", alignItems: "center", gap: 1 },
  halfStarContainer: { position: "relative", overflow: "hidden" },
  halfStarOverlay: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  empty: { textAlign: "center", paddingVertical: 32 },
  footerLoading: { paddingVertical: 16, alignItems: "center" },
  loginBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  loginBannerInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  loginBannerText: { flex: 1, fontSize: 14, fontWeight: "600" },
});