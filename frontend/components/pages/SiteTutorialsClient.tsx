"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spin } from "antd";
import { Ionicons } from "../ui/icons";
import { message } from "@/components/antd-wrapper";
import {
  cancelTutorialDelete,
  reportTutorialVisit,
  requestTutorialDelete,
  useSiteTutorials,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import type { SiteTutorial, TutorialType } from "../../lib/types";
import AuthModal from "../AuthModal";
import { ConfirmModal } from "../ConfirmModal";
import { openExternal } from "../../lib/utils";
import SeoHeading from "../SeoHeading";

interface PendingConfirm {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}

function TutorialItem({
  tutorial,
  onOpen,
  onDeleteRequest,
  onDeleteCancel,
  onEdit,
}: {
  tutorial: SiteTutorial;
  onOpen: (t: SiteTutorial) => void;
  onDeleteRequest: (t: SiteTutorial) => void;
  onDeleteCancel: (t: SiteTutorial) => void;
  onEdit: (t: SiteTutorial) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 12,
        paddingBottom: 12,
        borderRadius: 10,
        border: "1px solid var(--fn-border)",
        backgroundColor: "var(--fn-surface)",
        marginBottom: 8,
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(tutorial)}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 20,
            color: "var(--fn-text)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {tutorial.title}
        </div>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>
            {tutorial.username_masked}
          </span>
          <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name="eye-outline" size={12} color="var(--fn-text-tertiary)" />
            <span style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>{tutorial.view_count}</span>
          </span>
        </div>
      </button>

      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {tutorial.is_mine ? (
          tutorial.delete_pending ? (
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--fn-warning)" }}>{t("删除审核中")}</span>
              <button type="button" onClick={() => onDeleteCancel(tutorial)} style={actionButton}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-primary)" }}>{t("撤销")}</span>
              </button>
            </div>
          ) : tutorial.status === "pending" ? (
            <span style={{ fontSize: 11, color: "var(--fn-warning)" }}>{t("待审核")}</span>
          ) : tutorial.status === "rejected" ? (
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--fn-error)" }}>{t("已驳回")}</span>
              <button type="button" onClick={() => onEdit(tutorial)} style={actionButton}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-primary)" }}>{t("编辑")}</span>
              </button>
              {tutorial.can_delete ? (
                <button type="button" onClick={() => onDeleteRequest(tutorial)} style={actionButton}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-error)" }}>{t("删除")}</span>
                </button>
              ) : null}
            </div>
          ) : tutorial.can_delete ? (
            <button type="button" onClick={() => onDeleteRequest(tutorial)} style={actionButton}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-error)" }}>{t("删除")}</span>
            </button>
          ) : null
        ) : null}
        <Ionicons name="open-outline" size={14} color="var(--fn-text-tertiary)" />
      </div>
    </div>
  );
}

const actionButton: React.CSSProperties = {
  border: "none",
  background: "none",
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 2,
  paddingBottom: 2,
  cursor: "pointer",
};

function TutorialSection({
  label,
  icon,
  items,
  count,
  loading,
  hasNextPage,
  isLoadingMore,
  onLoadMore,
  onOpen,
  onDeleteRequest,
  onDeleteCancel,
  onEdit,
}: {
  label: string;
  icon: string;
  items: SiteTutorial[];
  count: number;
  loading: boolean;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (t: SiteTutorial) => void;
  onDeleteRequest: (t: SiteTutorial) => void;
  onDeleteCancel: (t: SiteTutorial) => void;
  onEdit: (t: SiteTutorial) => void;
}) {
  const { t } = useTranslation();
  return (
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
          <Ionicons name={icon} size={17} color="var(--fn-primary)" />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fn-text)", flex: 1 }}>{label}</span>
        {count > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fn-text-tertiary)" }}>{count}</span>
        ) : null}
      </div>

      {loading ? (
        <div style={{ padding: 20, display: "flex", justifyContent: "center" }}>
          <Spin size="small" />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 16, paddingBottom: 16, fontSize: 13, color: "var(--fn-text-tertiary)" }}>
          {t("暂无教程")}
        </div>
      ) : (
        <>
          {items.map((item) => (
            <TutorialItem
              key={item.id}
              tutorial={item}
              onOpen={onOpen}
              onDeleteRequest={onDeleteRequest}
              onDeleteCancel={onDeleteCancel}
              onEdit={onEdit}
            />
          ))}
          {hasNextPage ? (
            <button
              type="button"
              onClick={onLoadMore}
              style={{ paddingTop: 12, paddingBottom: 12, width: "100%", textAlign: "center", border: "none", background: "none", cursor: "pointer" }}
            >
              {isLoadingMore ? (
                <Spin size="small" />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fn-primary)" }}>{t("加载更多")}</span>
              )}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function SiteTutorialsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const params = useParams<{ id: string }>();
  const siteId = Number(params?.id);
  const queryClient = useQueryClient();

  const [authVisible, setAuthVisible] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const textQ = useSiteTutorials(siteId, "text");
  const videoQ = useSiteTutorials(siteId, "video");
  const agentQ = useSiteTutorials(siteId, "agent");

  const sections = useMemo(
    () => [
      { type: "text" as TutorialType, label: t("文字教程"), icon: "document-text-outline", query: textQ },
      { type: "video" as TutorialType, label: t("视频教程"), icon: "play-circle-outline", query: videoQ },
      { type: "agent" as TutorialType, label: t("辅助/代办"), icon: "people-outline", query: agentQ },
    ],
    [t, textQ, videoQ, agentQ],
  );

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(`/site/${siteId}`);
    }
  };

  const refreshTutorials = useCallback(() => {
    const keys: (string | number)[][] = [
      ["site-tutorials", siteId],
      ["site-tutorials-top", siteId],
      ["site", siteId],
    ];
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
  }, [queryClient, siteId]);

  const handleOpen = useCallback(
    (tutorial: SiteTutorial) => {
      reportTutorialVisit(siteId, tutorial.id);
      openExternal(tutorial.url);
    },
    [siteId],
  );

  const handleDeleteRequest = useCallback(
    (tutorial: SiteTutorial) => {
      if (tutorial.status === "rejected") {
        setConfirm({
          title: t("删除"),
          message: t("确认删除「{{title}}」？已驳回的教程将直接删除。", { title: tutorial.title }),
          confirmText: t("确认删除"),
          destructive: true,
          onConfirm: async () => {
            setConfirm(null);
            try {
              await requestTutorialDelete(siteId, tutorial.id);
              message.success(t("已删除"), 1.5);
              refreshTutorials();
            } catch (e: unknown) {
              message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
            }
          },
        });
        return;
      }
      setConfirm({
        title: t("申请删除教程"),
        message: t("确认申请删除「{{title}}」？提交后需管理员审核。", { title: tutorial.title }),
        confirmText: t("确认申请"),
        onConfirm: async () => {
          setConfirm(null);
          try {
            await requestTutorialDelete(siteId, tutorial.id);
            message.success(t("已提交删除申请，待管理员审核"), 1.5);
            refreshTutorials();
          } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
          }
        },
      });
    },
    [t, siteId, refreshTutorials],
  );

  const handleDeleteCancel = useCallback(
    async (tutorial: SiteTutorial) => {
      try {
        await cancelTutorialDelete(siteId, tutorial.id);
        message.success(t("已撤销删除申请"), 1.5);
        refreshTutorials();
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : t("操作失败"), 1.5);
      }
    },
    [t, siteId, refreshTutorials],
  );

  const handleSharePress = useCallback(() => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    router.push(`/site/${siteId}/tutorials/create`);
  }, [loggedIn, router, siteId]);

  const handleEdit = useCallback(
    (tutorial: SiteTutorial) => {
      if (!loggedIn) {
        setAuthVisible(true);
        return;
      }
      const qs = new URLSearchParams({
        edit: String(tutorial.id),
        type: tutorial.type,
        url: tutorial.url,
        title: tutorial.title,
        status: tutorial.status,
      });
      router.push(`/site/${siteId}/tutorials/create?${qs.toString()}`);
    },
    [loggedIn, router, siteId],
  );

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

  const initialLoading = textQ.isLoading && videoQ.isLoading && agentQ.isLoading;

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
            {t("教程")}
          </SeoHeading>
          <button
            type="button"
            onClick={handleSharePress}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 7,
              paddingBottom: 7,
              borderRadius: 999,
              border: "1px solid var(--fn-primary)",
              backgroundColor: "var(--fn-primary-light)",
              cursor: "pointer",
            }}
          >
            <Ionicons name="add" size={16} color="var(--fn-primary)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fn-primary)" }}>{t("分享教程")}</span>
          </button>
        </div>

        {initialLoading ? (
          <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin size="large" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: "var(--fn-text-tertiary)" }}>
              {t("分享你的教程链接，标题将自动获取；如不正确可手动修改。分享后需管理员审核通过才会公开展示。")}
            </div>
            {sections.map((section) => {
              const items = (section.query.data?.pages ?? []).flatMap((p) => p.results);
              return (
                <TutorialSection
                  key={section.type}
                  label={section.label}
                  icon={section.icon}
                  items={items}
                  count={section.query.data?.pages[0]?.count ?? 0}
                  loading={section.query.isLoading}
                  hasNextPage={!!section.query.hasNextPage}
                  isLoadingMore={section.query.isFetchingNextPage}
                  onLoadMore={() => section.query.fetchNextPage()}
                  onOpen={handleOpen}
                  onDeleteRequest={handleDeleteRequest}
                  onDeleteCancel={handleDeleteCancel}
                  onEdit={handleEdit}
                />
              );
            })}
          </div>
        )}

        <ConfirmModal
          visible={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => confirm?.onConfirm()}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          confirmText={confirm?.confirmText}
          destructive={confirm?.destructive}
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