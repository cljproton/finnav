import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator as RNActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Toast from "@ant-design/react-native/es/toast";
import Modal from "@ant-design/react-native/es/modal";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import {
  submitAppLink,
  useMyAppLinks,
  deleteAppLink,
  updateAppLink,
} from "../../../../../lib/api";
import { useAuth } from "../../../../../lib/auth";
import type { CaptchaPayload } from "../../../../../lib/auth";
import { useThemeColors } from "../../../../../constants/colors";
import type { AppLinkPlatform, AppLinkSubmission } from "../../../../../lib/types";
import AuthModal from "../../../../../components/AuthModal";

function openExternal(url: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  Linking.openURL(url);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PLATFORM_OPTIONS: {
  key: AppLinkPlatform;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
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

export default function SiteAppLinksScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = Number(id);
  const queryClient = useQueryClient();
  const formRef = useRef<ScrollView>(null);

  const [authVisible, setAuthVisible] = useState(false);
  const [platform, setPlatform] = useState<AppLinkPlatform>("android");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const myLinksQ = useMyAppLinks(siteId, loggedIn);

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
        Toast.success(t("已更新，等待管理员审核"), 1.5);
      } else {
        await submitAppLink(siteId, { platform, url: trimmed });
        setUrl("");
        Toast.success(t("提交成功，等待管理员审核"), 1.5);
      }
      queryClient.invalidateQueries({ queryKey: ["my-app-links", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
    } catch (e: any) {
      setSubmitError(e?.message || t("提交失败"));
    } finally {
      setSubmitting(false);
    }
  }, [t, url, platform, siteId, loggedIn, queryClient, editingId]);

  const handleDelete = (sub: AppLinkSubmission) => {
    const opt = PLATFORM_OPTIONS.find((o) => o.key === sub.platform);
    const label = opt ? t(opt.label) : sub.platform;
    Modal.alert(
      t("删除"),
      t("确认删除「{{name}}」？已驳回的提交将直接删除。", { name: label }),
      [
        { text: t("取消"), style: "cancel" },
        {
          text: t("确认删除"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAppLink(siteId, sub.id);
              Toast.success(t("已删除"), 1.5);
              queryClient.invalidateQueries({
                queryKey: ["my-app-links", siteId],
              });
              queryClient.invalidateQueries({ queryKey: ["site", siteId] });
            } catch (e: any) {
              Toast.fail(e?.message || t("操作失败"), 1.5);
            }
          },
        },
      ],
    );
  };

  const handleEdit = (sub: AppLinkSubmission) => {
    setPlatform(sub.platform);
    setUrl(sub.url);
    setEditingId(sub.id);
    setSubmitError("");
    formRef.current?.scrollTo({ y: 0, animated: true });
  };

  const selected = PLATFORM_OPTIONS.find((o) => o.key === platform)!;
  const sample = selected.sample;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("提交下载链接")}
        </Text>
        <View style={styles.topBarRight} />
      </View>

      <ScrollView
        ref={formRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {t("提交后需管理员审核，审核通过后自动更新到本站。")}
        </Text>

        {/* Submit form */}
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t("选择平台")}
          </Text>
          <View style={styles.platformRow}>
            {PLATFORM_OPTIONS.map((opt) => {
              const active = opt.key === platform;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPlatform(opt.key)}
                  style={[
                    styles.platformChip,
                    {
                      backgroundColor: active
                        ? colors.primaryLight
                        : colors.chipBg,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={15}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.platformChipText,
                      {
                        color: active ? colors.primary : colors.textSecondary,
                      },
                    ]}
                  >
                    {t(opt.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
            {t("下载链接")}
          </Text>
          <TextInput
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              if (submitError) setSubmitError("");
            }}
            placeholder={sample}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.urlInput,
              {
                color: colors.text,
                backgroundColor: colors.chipBg,
                borderColor: colors.border,
              },
            ]}
          />
          <Text style={[styles.sampleHint, { color: colors.textTertiary }]}>
            {t("示例：{{sample}}", { sample })}
          </Text>

          {submitError ? (
            <Text style={[styles.error, { color: colors.error }]}>
              {submitError}
            </Text>
          ) : null}

          {!loggedIn ? (
            <Text style={[styles.loginHint, { color: colors.textTertiary }]}>
              {t("登录后可提交下载链接")}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed || submitting ? 0.8 : 1,
              },
            ]}
          >
            {submitting ? (
              <RNActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {editingId !== null ? t("保存修改") : t("提交")}
              </Text>
            )}
          </Pressable>
          {editingId !== null ? (
            <Pressable
              onPress={() => {
                setEditingId(null);
                setUrl("");
                setPlatform("android");
                setSubmitError("");
              }}
              hitSlop={8}
              style={styles.cancelEditBtn}
            >
              <Text style={[styles.cancelEditText, { color: colors.textTertiary }]}>
                {t("取消编辑")}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* My submissions */}
        {loggedIn ? (
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
              <Ionicons name="list-outline" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("我的提交")}
              </Text>
              {myLinksQ.data?.pages[0]?.count ? (
                <Text
                  style={[styles.sectionCount, { color: colors.textTertiary }]}
                >
                  {myLinksQ.data.pages[0].count}
                </Text>
              ) : null}
            </View>

            {myLinksQ.isLoading ? (
              <View style={styles.sectionLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (myLinksQ.data?.pages ?? []).length === 0 ||
              (myLinksQ.data?.pages ?? []).flatMap((p) => p.results)
                .length === 0 ? (
              <Text style={[styles.sectionEmpty, { color: colors.textTertiary }]}>
                {t("暂无提交")}
              </Text>
            ) : (
              <>
                {(myLinksQ.data?.pages ?? [])
                  .flatMap((p) => p.results)
                  .map((sub) => {
                    const opt = PLATFORM_OPTIONS.find(
                      (o) => o.key === sub.platform,
                    );
                    return (
                      <View
                        key={sub.id}
                        style={[
                          styles.item,
                          {
                            backgroundColor: colors.chipBg,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View style={styles.itemHeader}>
                          <Ionicons
                            name={opt?.icon ?? "link-outline"}
                            size={16}
                            color={colors.primary}
                          />
                          <Text style={[styles.itemPlatform, { color: colors.text }]}>
                            {opt ? t(opt.label) : sub.platform}
                          </Text>
                          <Text
                            style={[
                              styles.itemStatus,
                              {
                                color:
                                  sub.status === "approved"
                                    ? colors.success
                                    : sub.status === "rejected"
                                      ? colors.error
                                      : colors.warning,
                              },
                            ]}
                          >
                            {appStatusLabel(sub.status, t)}
                          </Text>
                        </View>
                        <Text
                          style={[styles.itemUrl, { color: colors.primary }]}
                          numberOfLines={1}
                          onPress={() => openExternal(sub.url)}
                        >
                          {sub.url}
                        </Text>
                        <Text
                          style={[styles.itemTime, { color: colors.textTertiary }]}
                        >
                          {t("提交于 {{time}}", {
                            time: formatDateTime(sub.created_at),
                          })}
                        </Text>
                        {sub.status === "rejected" ? (
                          <>
                            <View style={styles.itemActions}>
                              <Pressable
                                onPress={() => handleEdit(sub)}
                                hitSlop={8}
                                style={[
                                  styles.itemActionBtn,
                                  { borderColor: colors.primary },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.itemActionText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  {t("编辑")}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleDelete(sub)}
                                hitSlop={8}
                                style={[
                                  styles.itemActionBtn,
                                  { borderColor: colors.error },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.itemActionText,
                                    { color: colors.error },
                                  ]}
                                >
                                  {t("删除")}
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                {myLinksQ.hasNextPage ? (
                  <Pressable
                    onPress={() => myLinksQ.fetchNextPage()}
                    style={({ pressed }) => [
                      styles.loadMore,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    {myLinksQ.isFetchingNextPage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text
                        style={[styles.loadMoreText, { color: colors.primary }]}
                      >
                        {t("加载更多")}
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

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
    width: 40,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
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
  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
  },
  platformRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  platformChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  platformChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  urlInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sampleHint: {
    fontSize: 12,
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
  },
  loginHint: {
    fontSize: 12,
    marginTop: 10,
  },
  submitBtn: {
    marginTop: 18,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
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
  sectionLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  sectionEmpty: {
    textAlign: "center",
    paddingVertical: 16,
    fontSize: 13,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: "auto",
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemPlatform: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemUrl: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 6,
  },
  itemTime: {
    fontSize: 12,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  itemActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemActionText: {
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
  cancelEditBtn: {
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: "500",
  },
});