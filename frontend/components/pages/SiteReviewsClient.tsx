"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Spin } from "antd";
import { Ionicons } from "../ui/icons";
import { useSiteReviews } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import type { SiteReview } from "../../lib/types";
import AuthModal from "../AuthModal";
import ErrorState from "../ErrorState";
import SeoHeading from "../SeoHeading";

function ReviewStars({ score, size = 12 }: { score: number; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = score >= i;
        const halfFilled = !filled && score >= i - 0.5;
        if (halfFilled) {
          return (
            <div key={i} style={{ position: "relative", width: size, height: size, overflow: "hidden" }}>
              <Ionicons name="star-outline" size={size} color="var(--fn-text-tertiary)" />
              <div style={{ position: "absolute", left: 0, top: 0, width: size / 2, height: size, overflow: "hidden" }}>
                <Ionicons name="star" size={size} color="var(--fn-star-active)" />
              </div>
            </div>
          );
        }
        return (
          <Ionicons
            key={i}
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? "var(--fn-star-active)" : "var(--fn-text-tertiary)"}
          />
        );
      })}
    </div>
  );
}

function ReviewItem({ review }: { review: SiteReview }) {
  return (
    <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--fn-border)" }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fn-text-secondary)" }}>
          {review.username_masked}
        </span>
        <ReviewStars score={review.score} />
      </div>
      {review.comment ? (
        <p style={{ fontSize: 14, lineHeight: 20, color: "var(--fn-text)", marginTop: 6, marginBottom: 0 }}>
          {review.comment}
        </p>
      ) : null}
    </div>
  );
}

export default function SiteReviewsClient() {
  const { t } = useTranslation();
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

  const reviews = useMemo(() => (data?.pages ?? []).flatMap((p) => p.results), [data]);
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
    <div style={{ backgroundColor: "var(--fn-bg)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 48px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            paddingBottom: 8,
          }}
        >
          <button
            type="button"
            onClick={goBack}
            aria-label={t("返回")}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: "var(--fn-surface)",
              border: "1px solid var(--fn-border)",
              boxShadow: "var(--fn-shadow-xs)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Ionicons name="chevron-back" size={22} color="var(--fn-text)" />
          </button>
          <SeoHeading level={1} style={{ fontSize: 17, fontWeight: 700, color: "var(--fn-text)" }}>
            {t("大家的评价")}
          </SeoHeading>
          <div style={{ width: 42 }} />
        </div>

        {isLoading ? (
          <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : error ? (
          <ErrorState message={error.message || t("加载失败")} onRetry={() => refetch()} />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }} onScroll={handleScroll}>
            <div style={{ fontSize: 12, color: "var(--fn-text-tertiary)", marginBottom: 12 }}>
              {t("共 {{count}} 条评价", { count: totalCount })}
            </div>

            {!loggedIn ? (
              <button
                type="button"
                onClick={() => setAuthVisible(true)}
                aria-label={t("登录后可查看评价内容")}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderRadius: 10,
                  border: "1px solid var(--fn-border)",
                  backgroundColor: "var(--fn-chip-bg)",
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <Ionicons name="log-in-outline" size={16} color="var(--fn-primary)" />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--fn-primary)", textAlign: "left" }}>
                  {t("登录后可查看评价内容")}
                </span>
                <Ionicons name="chevron-forward" size={15} color="var(--fn-text-tertiary)" />
              </button>
            ) : null}

            {reviews.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 32, color: "var(--fn-text-tertiary)", fontSize: 14 }}>
                {t("暂无其它评价")}
              </div>
            ) : (
              reviews.map((item) => <ReviewItem key={item.id} review={item} />)
            )}

            {isFetchingNextPage ? (
              <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
                <Spin size="small" />
              </div>
            ) : null}
          </div>
        )}

        <AuthModal
          visible={authVisible}
          onClose={() => setAuthVisible(false)}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onVerify={handleVerify}
          onRequestReset={handleRequestReset}
          onResetPassword={handleResetPassword}
        />
      </div>
    </div>
  );
}