"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "../ui/primitives";
import { Ionicons } from "../ui/icons";
import { Toast } from "../ui/antd";
import {
  cancelTutorialDelete,
  reportTutorialVisit,
  requestTutorialDelete,
  useSiteTutorials,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { CaptchaPayload } from "../../lib/auth";
import { useThemeColors, type Colors } from "../../constants/colors";
import type { SiteTutorial, TutorialType } from "../../lib/types";
import AuthModal from "../AuthModal";
import { ConfirmModal } from "../ConfirmModal";
import { centeredContent } from "../../constants/layout";
import { openExternal } from "../../lib/utils";
import SeoHeading from "../SeoHeading";
import { StyleSheet } from "../../lib/rnStyle";

interface PendingConfirm {
  title: string;
  message: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/* ---------- tutorial item ---------- */

function TutorialItem({
  tutorial,
  colors,
  onOpen,
  onDeleteRequest,
  onDeleteCancel,
  onEdit,
}: {
  tutorial: SiteTutorial;
  colors: Colors;
  onOpen: (t: SiteTutorial) => void;
  onDeleteRequest: (t: SiteTutorial) => void;
  onDeleteCancel: (t: SiteTutorial) => void;
  onEdit: (t: SiteTutorial) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.item,
        {
          backgroundColor: colors.linkSectionBg,
          borderColor: colors.linkSectionBorder,
        },
      ]}
    >
      <Pressable
        onPress={() => onOpen(tutorial)}
        style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[styles.itemTitle, { color: colors.linkItemText }]} numberOfLines={2}>
          {tutorial.title}
        </Text>
        <View style={styles.itemMeta}>
          <Text style={[styles.itemMetaText, { color: colors.textTertiary }]}>
            {tutorial.username_masked}
          </Text>
          <View style={styles.itemViews}>
            <Ionicons name="eye-outline" size={12} color={colors.textTertiary} />
            <Text style={[styles.itemMetaText, { color: colors.textTertiary }]}>
              {tutorial.view_count}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.itemRight}>
        {tutorial.is_mine ? (
          tutorial.delete_pending ? (
            <View style={styles.ownActions}>
              <Text style={[styles.pendingBadge, { color: colors.warning }]}>
                {t("删除审核中")}
              </Text>
              <Pressable onPress={() => onDeleteCancel(tutorial)} style={styles.ownActionBtn}>
                <Text style={[styles.ownActionText, { color: colors.primary }]}>
                  {t("撤销")}
                </Text>
              </Pressable>
            </View>
          ) : tutorial.status === "pending" ? (
            <Text style={[styles.pendingBadge, { color: colors.warning }]}>
              {t("待审核")}
            </Text>
          ) : tutorial.status === "rejected" ? (
            <View style={styles.ownActions}>
              <Text style={[styles.pendingBadge, { color: colors.error }]}>
                {t("已驳回")}
              </Text>
              <Pressable onPress={() => onEdit(tutorial)} style={styles.ownActionBtn}>
                <Text style={[styles.ownActionText, { color: colors.primary }]}>
                  {t("编辑")}
                </Text>
              </Pressable>
              {tutorial.can_delete ? (
                <Pressable onPress={() => onDeleteRequest(tutorial)} style={styles.ownActionBtn}>
                  <Text style={[styles.ownActionText, { color: colors.error }]}>
                    {t("删除")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : tutorial.can_delete ? (
            <Pressable onPress={() => onDeleteRequest(tutorial)} style={styles.ownActionBtn}>
              <Text style={[styles.ownActionText, { color: colors.error }]}>
                {t("删除")}
              </Text>
            </Pressable>
          ) : null
        ) : null}
        <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
      </View>
    </View>
  );
}

/* ---------- tutorial section ---------- */

function TutorialSection({
  label,
  icon,
  colors,
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
  type: TutorialType;
  label: string;
  icon: string;
  colors: Colors;
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
    <View
      style={[
        styles.section,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{label}</Text>
        {count > 0 ? (
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{count}</Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.sectionLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: colors.textTertiary }]}>
          {t("暂无教程")}
        </Text>
      ) : (
        <>
          {items.map((item) => (
            <TutorialItem
              key={item.id}
              tutorial={item}
              colors={colors}
              onOpen={onOpen}
              onDeleteRequest={onDeleteRequest}
              onDeleteCancel={onDeleteCancel}
              onEdit={onEdit}
            />
          ))}
          {hasNextPage ? (
            <Pressable
              onPress={onLoadMore}
              style={({ pressed }) => [styles.loadMore, { opacity: pressed ? 0.7 : 1 }]}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                  {t("加载更多")}
                </Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/* ---------- main ---------- */

export default function SiteTutorialsClient() {
  const { t } = useTranslation();
  const colors = useThemeColors();
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
          message: t("确认删除「{{title}}」？已驳回的教程将直接删除。", {
            title: tutorial.title,
          }),
          confirmText: t("确认删除"),
          destructive: true,
          onConfirm: async () => {
            setConfirm(null);
            try {
              await requestTutorialDelete(siteId, tutorial.id);
              Toast.success(t("已删除"), 1.5);
              refreshTutorials();
            } catch (e: unknown) {
              Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
            }
          },
        });
        return;
      }
      setConfirm({
        title: t("申请删除教程"),
        message: t("确认申请删除「{{title}}」？提交后需管理员审核。", {
          title: tutorial.title,
        }),
        confirmText: t("确认申请"),
        onConfirm: async () => {
          setConfirm(null);
          try {
            await requestTutorialDelete(siteId, tutorial.id);
            Toast.success(t("已提交删除申请，待管理员审核"), 1.5);
            refreshTutorials();
          } catch (e: unknown) {
            Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
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
        Toast.success(t("已撤销删除申请"), 1.5);
        refreshTutorials();
      } catch (e: unknown) {
        Toast.fail(e instanceof Error ? e.message : t("操作失败"), 1.5);
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

  const initialLoading = textQ.isLoading && videoQ.isLoading && agentQ.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: 12 }]}>
        <Pressable onPress={goBack} style={styles.backBtn} accessibilityLabel={t("返回")}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <SeoHeading level={1} style={[styles.title, { color: colors.text }]}>
          {t("教程")}
        </SeoHeading>
        <View style={styles.topBarRight}>
          <Pressable
            onPress={handleSharePress}
            style={({ pressed }) => [
              styles.shareBtn,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[styles.shareBtnText, { color: colors.primary }]}>
              {t("分享教程")}
            </Text>
          </Pressable>
        </View>
      </View>

      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, centeredContent.container]}
        >
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {t("分享你的教程链接，标题将自动获取；如不正确可手动修改。分享后需管理员审核通过才会公开展示。")}
          </Text>

          {sections.map((section) => {
            const items = (section.query.data?.pages ?? []).flatMap((p) => p.results);
            return (
              <TutorialSection
                key={section.type}
                type={section.type}
                label={section.label}
                icon={section.icon}
                colors={colors}
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
        </ScrollView>
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
  topBarRight: { flexDirection: "row", alignItems: "center" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  shareBtnText: { fontSize: 13, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "700" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  hint: { fontSize: 12, marginBottom: 14 },
  section: { marginBottom: 14, borderRadius: 14, borderWidth: 1, padding: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  sectionCount: { fontSize: 12, fontWeight: "600" },
  sectionLoading: { paddingVertical: 20, alignItems: "center" },
  sectionEmpty: { textAlign: "center", paddingVertical: 16, fontSize: 13 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemMain: { flex: 1, marginRight: 8 },
  itemTitle: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  itemMetaText: { fontSize: 12 },
  itemViews: { flexDirection: "row", alignItems: "center", gap: 3 },
  itemRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingBadge: { fontSize: 11 },
  ownActionBtn: { paddingHorizontal: 4, paddingVertical: 2, cursor: "pointer" },
  ownActionText: { fontSize: 12, fontWeight: "600" },
  loadMore: { paddingVertical: 12, alignItems: "center" },
  loadMoreText: { fontSize: 14, fontWeight: "600" },
});