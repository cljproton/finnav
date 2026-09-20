"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "../ui/icons";
import { Input, Button, Spin } from "@/components/antd-wrapper";
import { message } from "@/components/antd-wrapper";
import {
  submitAppLink,
  useMyAppLinks,
  deleteAppLink,
  updateAppLink,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import type { AppLinkPlatform, AppLinkSubmission } from "../../lib/types";
import AuthModal from "../AuthModal";
import { DeleteConfirmModal } from "../DeleteConfirmModal";
import { formatDateTime, openExternal } from "../../lib/utils";
import SeoHeading from "../SeoHeading";

const PLATFORM_OPTIONS: {
  key: AppLinkPlatform;
  label: string;
  icon: string;
  sample: string;
}[] = [
  {
    key: "android",
    label: "安卓 APP",
    icon: "logo-android",
    sample: "https://example.com/your-app.apk",
  },
  {
    key: "google_play",
    label: "Google Play",
    icon: "logo-google-playstore",
    sample: "https://play.google.com/store/apps/details?id=com.example.app",
  },
  {
    key: "ios",
    label: "iOS App Store",
    icon: "logo-apple",
    sample: "https://apps.apple.com/app/example/id123456789",
  },
];

function appStatusLabel(
  status: AppLinkSubmission["status"],
  t: (key: string) => string,
): string {
  switch (status) {
    case "pending":
      return t("待审核");
    case "approved":
      return t("已通过");
    case "rejected":
      return t("已驳回");
  }
}

export default function SiteAppLinksClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const params = useParams<{ id: string }>();
  const siteId = Number(params?.id);
  const queryClient = useQueryClient();

  const [authVisible, setAuthVisible] = useState(false);
  const [platform, setPlatform] = useState<AppLinkPlatform>("android");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppLinkSubmission | null>(null);

  const myLinksQ = useMyAppLinks(siteId, loggedIn);

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

  const handleSubmit = useCallback(async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      setSubmitError(t("请输入链接"));
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      if (editingId !== null) {
        await updateAppLink(siteId, editingId, { platform, url: trimmed });
        setEditingId(null);
        setUrl("");
        setPlatform("android");
        message.success(t("已更新，等待管理员审核"), 1.5);
      } else {
        await submitAppLink(siteId, { platform, url: trimmed });
        setUrl("");
        message.success(t("提交成功，等待管理员审核"), 1.5);
      }
      queryClient.invalidateQueries({ queryKey: ["my-app-links", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t("提交失败"));
    } finally {
      setSubmitting(false);
    }
  }, [t, url, platform, siteId, loggedIn, queryClient, editingId]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await deleteAppLink(siteId, pendingDelete.id);
      message.success(t("已删除"), 1.5);
      queryClient.invalidateQueries({ queryKey: ["my-app-links", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, siteId, queryClient, t]);

  const handleEdit = (sub: AppLinkSubmission) => {
    setPlatform(sub.platform);
    setUrl(sub.url);
    setEditingId(sub.id);
    setSubmitError("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setUrl("");
    setPlatform("android");
    setSubmitError("");
  };

  const selected = PLATFORM_OPTIONS.find((o) => o.key === platform)!;
  const sample = selected.sample;
  const myItems = (myLinksQ.data?.pages ?? []).flatMap((p) => p.results);

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
            {t("提交下载链接")}
          </SeoHeading>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>
            {t("提交后需管理员审核，审核通过后自动更新到本站。")}
          </div>

          <div className="fn-card" style={{ padding: 16, boxShadow: "var(--fn-shadow-sm)" }}>
            <div style={{ fontSize: 13, color: "var(--fn-text-secondary)", marginBottom: 8 }}>
              {t("选择平台")}
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {PLATFORM_OPTIONS.map((opt) => {
                const active = opt.key === platform;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPlatform(opt.key)}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      paddingTop: 10,
                      paddingBottom: 10,
                      borderRadius: 10,
                      border: `1px solid ${active ? "var(--fn-primary)" : "var(--fn-border)"}`,
                      backgroundColor: active ? "var(--fn-primary-light)" : "var(--fn-chip-bg)",
                      cursor: "pointer",
                    }}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={15}
                      color={active ? "var(--fn-primary)" : "var(--fn-text-secondary)"}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--fn-primary)" : "var(--fn-text-secondary)" }}>
                      {t(opt.label)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 13, color: "var(--fn-text-secondary)", marginBottom: 8 }}>
              {t("下载链接")}
            </div>
            <Input
              value={url}
              onChange={(e) => {
                const text = e.target.value;
                setUrl(text);
                if (submitError) setSubmitError("");
              }}
              placeholder={sample}
              style={{
                borderRadius: 10,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 10,
                paddingBottom: 10,
                fontSize: 14,
                color: "var(--fn-text)",
                backgroundColor: "var(--fn-chip-bg)",
                borderColor: "var(--fn-border)",
                boxShadow: "none",
              }}
            />
            <div style={{ fontSize: 12, marginTop: 8, color: "var(--fn-text-tertiary)" }}>
              {t("示例：{{sample}}", { sample })}
            </div>

            {submitError ? (
              <div style={{ fontSize: 13, marginTop: 10, color: "var(--fn-error)" }}>{submitError}</div>
            ) : null}

            {!loggedIn ? (
              <div style={{ fontSize: 12, marginTop: 10, color: "var(--fn-text-tertiary)" }}>
                {t("登录后可提交下载链接")}
              </div>
            ) : null}

            <Button
              type="primary"
              block
              loading={submitting}
              onClick={handleSubmit}
              style={{ marginTop: 18, height: 46, borderRadius: 10, fontSize: 15, fontWeight: 700 }}
            >
              {editingId !== null ? t("保存修改") : t("提交")}
            </Button>
            {editingId !== null ? (
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <Button type="link" onClick={cancelEdit} style={{ color: "var(--fn-text-tertiary)" }}>
                  {t("取消编辑")}
                </Button>
              </div>
            ) : null}
          </div>

          {loggedIn ? (
            <div className="fn-card" style={{ padding: 16, boxShadow: "var(--fn-shadow-sm)" }}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    backgroundColor: "var(--fn-primary-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="list-outline" size={17} color="var(--fn-primary)" />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fn-text)", flex: 1 }}>
                  {t("我的提交")}
                </span>
                {myLinksQ.data?.pages[0]?.count ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-text-tertiary)" }}>
                    {myLinksQ.data.pages[0].count}
                  </span>
                ) : null}
              </div>

              {myLinksQ.isLoading ? (
                <div style={{ padding: 20, display: "flex", justifyContent: "center" }}>
                  <Spin size="small" />
                </div>
              ) : myItems.length === 0 ? (
                <div style={{ textAlign: "center", paddingTop: 16, paddingBottom: 16, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
                  {t("暂无提交")}
                </div>
              ) : (
                <>
                  {myItems.map((sub) => {
                    const opt = PLATFORM_OPTIONS.find((o) => o.key === sub.platform);
                    const statusColor =
                      sub.status === "approved"
                        ? "var(--fn-success)"
                        : sub.status === "rejected"
                          ? "var(--fn-error)"
                          : "var(--fn-warning)";
                    return (
                      <div
                        key={sub.id}
                        style={{
                          paddingLeft: 14,
                          paddingRight: 14,
                          paddingTop: 12,
                          paddingBottom: 12,
                          borderRadius: 10,
                          border: "1px solid var(--fn-border)",
                          backgroundColor: "var(--fn-chip-bg)",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name={opt?.icon ?? "link-outline"} size={16} color="var(--fn-primary)" />
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--fn-text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {opt ? t(opt.label) : sub.platform}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>
                            {appStatusLabel(sub.status, t)}
                          </span>
                        </div>
                        <div
                          style={{ fontSize: 13, fontWeight: 500, marginTop: 6, color: "var(--fn-primary)", cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                          onClick={() => openExternal(sub.url)}
                        >
                          {sub.url}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 4, color: "var(--fn-text-tertiary)" }}>
                          {t("提交于 {{time}}", { time: formatDateTime(sub.created_at) })}
                        </div>
                        {sub.status === "rejected" ? (
                          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-start" }}>
                            <Button size="small" onClick={() => handleEdit(sub)}>
                              {t("编辑")}
                            </Button>
                            <Button size="small" danger onClick={() => setPendingDelete(sub)}>
                              {t("删除")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {myLinksQ.hasNextPage ? (
                    <button
                      type="button"
                      onClick={() => myLinksQ.fetchNextPage()}
                      style={{ paddingTop: 12, paddingBottom: 12, width: "100%", textAlign: "center", border: "none", background: "none", cursor: "pointer" }}
                    >
                      {myLinksQ.isFetchingNextPage ? (
                        <Spin size="small" />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-primary)" }}>{t("加载更多")}</span>
                      )}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <DeleteConfirmModal
          visible={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          name={
            pendingDelete
              ? (() => {
                  const opt = PLATFORM_OPTIONS.find((o) => o.key === pendingDelete.platform);
                  return opt ? t(opt.label) : pendingDelete.platform;
                })()
              : ""
          }
        />

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