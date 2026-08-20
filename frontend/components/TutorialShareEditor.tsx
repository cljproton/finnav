import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator as RNActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Toast from "@ant-design/react-native/es/toast";
import ActivityIndicator from "@ant-design/react-native/es/activity-indicator";
import {
  fetchTutorialTitle,
  shareTutorial,
  updateTutorial,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useThemeColors } from "../constants/colors";
import type { SiteTutorial, TutorialType } from "../lib/types";
import AuthModal from "./AuthModal";

const URL_RE = /^https?:\/\/[^\s]+$/i;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

const TYPE_OPTIONS: {
  type: TutorialType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sample: string;
  desc: string;
}[] = [
  {
    type: "text",
    label: "文字教程",
    icon: "document-text-outline",
    sample: "https://example.com/guide",
    desc: "博客文章、图文教程这类页面",
  },
  {
    type: "video",
    label: "视频教程",
    icon: "play-circle-outline",
    sample: "https://www.bilibili.com/video/...",
    desc: "讲解视频、录屏教程（B站/YouTube 等）",
  },
  {
    type: "agent",
    label: "辅助/代办",
    icon: "people-outline",
    sample: "https://example.com/tool",
    desc: "工具、代跑腿这类辅助小服务",
  },
];

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function friendlyError(e: any, t: (key: string) => string): string {
  const msg = String(e?.message ?? "");
  const lower = msg.toLowerCase();
  if (/already|重复|已存在|已提交|unique|exist/i.test(lower)) {
    return t("看起来这个链接已经分享过了，试试换个链接");
  }
  if (/url|invalid|格式|无效|must be|enter a valid/i.test(lower)) {
    return t("链接格式好像不太对，检查一下是不是完整的网址");
  }
  if (/network|failed to fetch|timeout|超时|服务器|server|50[0-9]/i.test(lower)) {
    return t("网络好像开小差了，稍后再试一次吧");
  }
  return msg || t("提交失败了，请稍后再试");
}

function StepIndicator({ current }: { current: number }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const steps = [t("选择类型"), t("粘贴链接"), t("确认标题")];
  return (
    <View style={styles.steps}>
      {steps.map((label, idx) => {
        const n = idx + 1;
        const done = n < current;
        const active = n === current;
        const filled = done || active;
        return (
          <React.Fragment key={label}>
            {idx > 0 ? (
              <View
                style={[
                  styles.stepLine,
                  { backgroundColor: done ? colors.primary : colors.border },
                ]}
              />
            ) : null}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    backgroundColor: filled ? colors.primary : colors.chipBg,
                    borderColor: active ? colors.borderGlow : "transparent",
                  },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepNum,
                      { color: filled ? "#FFFFFF" : colors.textTertiary },
                    ]}
                  >
                    {n}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  { color: filled ? colors.primary : colors.textTertiary },
                ]}
              >
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function TutorialShareEditor({
  siteId,
  mode,
  initial,
}: {
  siteId: number;
  mode: "create" | "edit";
  initial?: SiteTutorial | null;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const auth = useAuth();
  const loggedIn = !!auth.token;
  const queryClient = useQueryClient();

  const [type, setType] = useState<TutorialType>(initial?.type ?? "text");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleEdited, setTitleEdited] = useState(
    mode === "edit" && !!initial?.title,
  );
  const [titleFetching, setTitleFetching] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    fallback: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [authVisible, setAuthVisible] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = TYPE_OPTIONS.find((o) => o.type === type)!;
  const sample = selected.sample;

  const runFetch = useCallback(async () => {
    const u = url.trim();
    if (!loggedIn || titleEdited || !URL_RE.test(u)) return;
    setTitleFetching(true);
    try {
      const res = await fetchTutorialTitle(siteId, u);
      setPreview(res);
      if (!res.fallback) {
        setTitle(res.title);
      }
    } catch {
      setPreview(null);
    } finally {
      setTitleFetching(false);
    }
  }, [loggedIn, titleEdited, url, siteId]);

  useEffect(() => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    const u = url.trim();
    if (!loggedIn || titleEdited || !URL_RE.test(u)) {
      setTitleFetching(false);
      return;
    }
    setTitleFetching(true);
    previewTimer.current = setTimeout(() => {
      runFetch();
    }, 600);
    return () => {
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
        previewTimer.current = null;
      }
    };
  }, [url, loggedIn, titleEdited, siteId, runFetch]);

  const handleRefetch = useCallback(() => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    runFetch();
  }, [runFetch]);

  const handleUrlBlur = () => {
    const normalized = normalizeUrl(url);
    if (normalized !== url) setUrl(normalized);
  };

  const handleSubmit = async () => {
    if (!loggedIn) {
      setAuthVisible(true);
      return;
    }
    const normalized = normalizeUrl(url);
    if (normalized !== url) setUrl(normalized);
    if (!normalized) {
      setSubmitError(t("请输入链接，或粘贴后我们也会帮你自动补全"));
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = { type, url: normalized, title };
      if (mode === "edit" && initial) {
        await updateTutorial(siteId, initial.id, payload);
        Toast.success(t("已更新，等待重新审核"), 1.5);
      } else {
        await shareTutorial(siteId, payload);
        Toast.success(t("提交成功！审核通过后就会公开啦"), 1.5);
      }
      queryClient.invalidateQueries({ queryKey: ["site-tutorials", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site-tutorials-top", siteId] });
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/site/${siteId}/tutorials`);
      }
    } catch (e: any) {
      setSubmitError(friendlyError(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/site/${siteId}/tutorials`);
    }
  };

  const urlFilled = url.trim().length > 0;
  const titleFilled = title.trim().length > 0;
  const currentStep = urlFilled ? (titleFilled ? 4 : 3) : 2;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {mode === "edit" ? t("编辑教程") : t("分享教程")}
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitTopBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {submitting ? (
            <RNActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitTopText}>
              {mode === "edit" ? t("保存") : t("提交")}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {t(
            "分享你的教程链接，标题会自动获取，你只需要确认一下就好啦。审核通过后就会公开展示给其他用户。",
          )}
        </Text>

        <StepIndicator current={currentStep} />

        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t("选择类型")}
          </Text>
          {TYPE_OPTIONS.map((opt) => {
            const active = opt.type === type;
            return (
              <Pressable
                key={opt.type}
                onPress={() => setType(opt.type)}
                style={({ pressed }) => [
                  styles.typeCard,
                  {
                    backgroundColor: active
                      ? colors.primaryLight
                      : colors.chipBg,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.typeIcon,
                    {
                      backgroundColor: active
                        ? colors.primary
                        : colors.chipBg,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? "#FFFFFF" : colors.textSecondary}
                  />
                </View>
                <View style={styles.typeTextWrap}>
                  <Text
                    style={[
                      styles.typeTitle,
                      { color: active ? colors.primary : colors.text },
                    ]}
                  >
                    {t(opt.label)}
                  </Text>
                  <Text
                    style={[styles.typeDesc, { color: colors.textSecondary }]}
                  >
                    {t(opt.desc)}
                  </Text>
                </View>
                {active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t("教程链接")}
          </Text>
          <TextInput
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setPreview(null);
              if (submitError) setSubmitError("");
            }}
            onBlur={handleUrlBlur}
            onSubmitEditing={handleUrlBlur}
            placeholder={sample}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
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

          {titleFetching ? (
            <View style={styles.fetchingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[styles.fetchingText, { color: colors.textSecondary }]}
              >
                {t("自动获取标题中…")}
              </Text>
            </View>
          ) : null}

          {preview ? (
            <View
              style={[
                styles.previewCard,
                {
                  backgroundColor: preview.fallback
                    ? colors.chipBg
                    : colors.primaryLight,
                  borderColor: preview.fallback
                    ? colors.border
                    : colors.borderGlow,
                },
              ]}
            >
              <View style={styles.previewHeader}>
                <Ionicons
                  name={
                    preview.fallback
                      ? "information-circle-outline"
                      : "checkmark-circle"
                  }
                  size={16}
                  color={preview.fallback ? colors.warning : colors.success}
                />
                <Text
                  style={[
                    styles.previewLabel,
                    {
                      color: preview.fallback
                        ? colors.warning
                        : colors.success,
                    },
                  ]}
                >
                  {preview.fallback
                    ? t("暂时没能自动获取标题")
                    : t("已自动获取标题")}
                </Text>
                <Pressable
                  onPress={handleRefetch}
                  disabled={titleFetching}
                  hitSlop={8}
                  style={styles.refetchBtn}
                >
                  <Ionicons name="refresh" size={13} color={colors.primary} />
                  <Text style={[styles.refetchText, { color: colors.primary }]}>
                    {t("重新获取")}
                  </Text>
                </Pressable>
              </View>
              {preview.fallback ? (
                <Text
                  style={[
                    styles.previewFallbackText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t(
                    "暂时没能自动获取标题，你可以手动填写，或留空由我们提交时再试一次",
                  )}
                </Text>
              ) : (
                <Text
                  style={[styles.previewTitle, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {preview.title}
                </Text>
              )}
            </View>
          ) : null}

          <View style={styles.titleLabelRow}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {t("标题")}
            </Text>
            <Text style={[styles.titleOptional, { color: colors.textTertiary }]}>
              {t("（可选，留空自动获取）")}
            </Text>
          </View>
          <TextInput
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setTitleEdited(true);
            }}
            placeholder={t("可手动填写标题")}
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            style={[
              styles.urlInput,
              {
                color: colors.text,
                backgroundColor: colors.chipBg,
                borderColor: colors.border,
              },
            ]}
          />
        </View>

        {mode === "edit" && initial?.status === "rejected" ? (
          <View style={styles.rejectedBanner}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={colors.warning}
            />
            <Text
              style={[styles.rejectedBannerText, { color: colors.warning }]}
            >
              {t("这条教程之前没通过审核，修改后会自动重新提交审核。")}
            </Text>
          </View>
        ) : null}

        {!loggedIn ? (
          <View style={styles.loginNotice}>
            <Ionicons
              name="person-circle-outline"
              size={16}
              color={colors.textTertiary}
            />
            <Text style={[styles.loginNoticeText, { color: colors.textTertiary }]}>
              {t("登录后就可以分享教程啦")}
            </Text>
          </View>
        ) : null}

        {submitError ? (
          <Text style={[styles.error, { color: colors.error }]}>
            {submitError}
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
              {mode === "edit" ? t("保存修改") : t("提交分享")}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onLogin={(email, password, captcha) => auth.login(email, password, captcha)}
        onLoginTFA={(email, totpToken, code) =>
          auth.loginTFA(email, totpToken, code)
        }
        onRegister={(email, password, captcha) =>
          auth.register(email, password, captcha)
        }
        onVerify={(email, code, password) => auth.verify(email, code, password)}
        onRequestReset={(email) => auth.requestPasswordReset(email)}
        onResetPassword={(email, code, password) =>
          auth.resetPassword(email, code, password)
        }
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
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  submitTopBtn: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  submitTopText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  intro: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  steps: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  stepItem: {
    alignItems: "center",
    width: 72,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  stepNum: {
    fontSize: 13,
    fontWeight: "700",
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 12,
    marginHorizontal: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTextWrap: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  typeDesc: {
    fontSize: 12,
    marginTop: 2,
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
  fetchingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  fetchingText: {
    fontSize: 12,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  refetchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  refetchText: {
    fontSize: 12,
    fontWeight: "600",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 20,
  },
  previewFallbackText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  titleLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 10,
  },
  titleOptional: {
    fontSize: 12,
  },
  rejectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(217,119,6,0.10)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 14,
  },
  rejectedBannerText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  loginNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: 12,
  },
  loginNoticeText: {
    fontSize: 13,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});