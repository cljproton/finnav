import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Modal from "@ant-design/react-native/es/modal";
import Toast from "@ant-design/react-native/es/toast";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import {
  cancelTutorialDelete,
  reportTutorialVisit,
  requestTutorialDelete,
  useSiteTutorials,
} from "../../../../../lib/api";
import { useAuth } from "../../../../../lib/auth";
import type { CaptchaPayload } from "../../../../../lib/auth";
import { useThemeColors } from "../../../../../constants/colors";
import type { SiteTutorial, TutorialType } from "../../../../../lib/types";
import AuthModal from "../../../../../components/AuthModal";

function openExternal(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  Linking.openURL(url);
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
  colors: any;
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
        <Text
          style={[styles.itemTitle, { color: colors.linkItemText }]}
          numberOfLines={2}
        >
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
              <Pressable
                onPress={() => onDeleteCancel(tutorial)}
                hitSlop={8}
                style={styles.ownActionBtn}
              >
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
              <Pressable
                onPress={() => onEdit(tutorial)}
                hitSlop={8}
                style={styles.ownActionBtn}
              >
                <Text style={[styles.ownActionText, { color: colors.primary }]}>
                  {t("编辑")}
                </Text>
              </Pressable>
              {tutorial.can_delete ? (
                <Pressable
                  onPress={() => onDeleteRequest(tutorial)}
                  hitSlop={8}
                  style={styles.ownActionBtn}
                >
                  <Text style={[styles.ownActionText, { color: colors.error }]}>
                    {t("删除")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : tutorial.can_delete ? (
            <Pressable
              onPress={() => onDeleteRequest(tutorial)}
              hitSlop={8}
              style={styles.ownActionBtn}
            >
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
  type,
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
  icon: keyof typeof Ionicons.glyphMap;
  colors: any;
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
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
            {count}
          </Text>
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
              style={({ pressed }) => [
                styles.loadMore,
                { opacity: pressed ? 0.7 : 1 },
              ]}
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

export default function SiteTutorialsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  const queryClient = useQueryClient();

  const [authVisible, setAuthVisible] = useState(false);

  const textQ = useSiteTutorials(siteId, "text");
  const videoQ = useSiteTutorials(siteId, "video");
  const agentQ = useSiteTutorials(siteId, "agent");

  const sections = useMemo(
    () => [
      {
        type: "text" as TutorialType,
        label: t("文字教程"),
        icon: "document-text-outline" as const,
        query: textQ,
      },
      {
        type: "video" as TutorialType,
        label: t("视频教程"),
        icon: "play-circle-outline" as const,
        query: videoQ,
      },
      {
        type: "agent" as TutorialType,
        label: t("辅助/代办"),
        icon: "people-outline" as const,
        query: agentQ,
      },
    ],
    [t, textQ, videoQ, agentQ],
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/site/${siteId}`);
    }
  };

  const refreshTutorials = useCallback(
    (type?: TutorialType) => {
      const keys: (string | number)[][] = [
        ["site-tutorials", siteId],
        ["site-tutorials-top", siteId],
        ["site", siteId],
      ];
      keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
    },
    [queryClient, siteId],
  );

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
        Modal.alert(
          t("删除"),
          t("确认删除「{{title}}」？已驳回的教程将直接删除。", {
            title: tutorial.title,
          }),
          [
            { text: t("取消"), style: "cancel" },
            {
              text: t("确认删除"),
              style: "destructive",
              onPress: async () => {
                try {
                  await requestTutorialDelete(siteId, tutorial.id);
                  Toast.success(t("已删除"), 1.5);
                  refreshTutorials(tutorial.type);
                } catch (e: any) {
                  Toast.fail(e?.message || t("操作失败"), 1.5);
                }
              },
            },
          ],
        );
        return;
      }
      Modal.alert(
        t("申请删除教程"),
        t("确认申请删除「{{title}}」？提交后需管理员审核。", {
          title: tutorial.title,
        }),
        [
          { text: t("取消"), style: "cancel" },
          {
            text: t("确认申请"),
            onPress: async () => {
              try {
                await requestTutorialDelete(siteId, tutorial.id);
                Toast.success(t("已提交删除申请，待管理员审核"), 1.5);
                refreshTutorials(tutorial.type);
              } catch (e: any) {
                Toast.fail(e?.message || t("操作失败"), 1.5);
              }
            },
          },
        ],
      );
    },
    [t, siteId, refreshTutorials],
  );

  const handleDeleteCancel = useCallback(
    async (tutorial: SiteTutorial) => {
      try {
        await cancelTutorialDelete(siteId, tutorial.id);
        Toast.success(t("已撤销删除申请"), 1.5);
        refreshTutorials(tutorial.type);
      } catch (e: any) {
        Toast.fail(e?.message || t("操作失败"), 1.5);
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
      router.push(
        `/site/${siteId}/tutorials/create?edit=${tutorial.id}&type=${tutorial.type}&url=${encodeURIComponent(tutorial.url)}&title=${encodeURIComponent(tutorial.title)}&status=${tutorial.status}`,
      );
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

  const initialLoading =
    textQ.isLoading && videoQ.isLoading && agentQ.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t("教程")}</Text>
        <View style={styles.topBarRight}>
          <Pressable
            onPress={handleSharePress}
            hitSlop={12}
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
          contentContainerStyle={styles.list}
        >
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {t("分享你的教程链接，标题将自动获取；如不正确可手动修改。分享后需管理员审核通过才会公开展示。")}
          </Text>

          {sections.map((section) => {
            const items = (section.query.data?.pages ?? []).flatMap(
              (p) => p.results,
            );
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

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 52,
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
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "600",
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
    paddingBottom: 48,
  },
  hint: {
    fontSize: 12,
    marginBottom: 14,
  },
  section: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  sectionEmpty: {
    textAlign: "center",
    paddingVertical: 16,
    fontSize: 13,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemMain: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  itemMetaText: {
    fontSize: 12,
  },
  itemViews: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pendingBadge: {
    fontSize: 11,
  },
  ownActionBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  ownActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadMore: {
    paddingVertical: 12,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
});